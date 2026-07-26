/**
 * GLSL ES 3.00 sources for the Director graph.
 *
 * Shader source text is one of the cases the repository's "no executable code
 * in string literals" rule exempts: `gl.shaderSource` takes source text and
 * nothing else. The interpolations below are deliberately narrow — packed
 * vocabulary codes and shared visual constants, read from the TypeScript tables
 * that own them — so a shader can never disagree with
 * `graph-visual-language.ts` about which code means `success` or how much the
 * CRT barrel curves.
 *
 * All five programs are instanced or attribute-free:
 *
 * - `field`  one static buffer of drifting medium particles, uniforms only
 * - `edge`   one segment strip per instance, endpoints read from the node state texture
 * - `node`   one particle template per instance, node state read from the same texture
 * - `glyph`  one quad per instance, sharing the node pass's static instance buffer
 * - `post`   attribute-free fullscreen triangle over the scene framebuffer
 *
 * Per-frame layout changes therefore touch one RG32F texture. Nothing here
 * uploads geometry per frame, and nothing here makes a product decision.
 */

import {
  packedGraphDetails,
  packedGraphEdgeChannels,
  packedGraphEmphases,
  packedGraphModeCode,
  packedGraphModes,
  packedGraphRoles,
} from "../packed-graph-vocabulary";
import { graphBarrel, graphEdgeGeometry, graphLiveEdgeClipY } from "./graph-visual-language";

/** Identity tag; it exists so editors syntax-highlight these blocks as GLSL. */
function glsl(strings: TemplateStringsArray, ...values: readonly (string | number)[]): string {
  return strings.reduce<string>(
    (text, chunk, index) => text + chunk + (index < values.length ? String(values[index]) : ""),
    "",
  );
}

/** Renders a number so GLSL always reads it as a float literal. */
function f(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

const successMode = f(packedGraphModeCode.success);
const failMode = f(packedGraphModeCode.fail);
const listeningMode = f(packedGraphModeCode.listening);
const liveEdgeY = f(graphLiveEdgeClipY);
const barrel = f(graphBarrel);
const edgeGrow = f(graphEdgeGeometry.growSeconds);

const modeCount = packedGraphModes.length;
const roleCount = packedGraphRoles.length;
const emphasisCount = packedGraphEmphases.length;
const channelCount = packedGraphEdgeChannels.length;
const detailCount = packedGraphDetails.length;

/** Halo slots the field pass dims around; bounded so the uniform stays small. */
export const graphFieldHaloSlots = 24;

const header = "#version 300 es\n";

const hashChunk = glsl`
float hash11(float p){ p=fract(p*0.1031); p*=p+33.33; p*=p+p; return fract(p); }
`;

/** Reads one node's live (worldY, open) out of the RG32F state texture. */
const nodeStateChunk = glsl`
uniform highp sampler2D u_nodeState;
uniform int u_nodeTexWidth;
vec2 nodeState(int index){
  return texelFetch(u_nodeState, ivec2(index % u_nodeTexWidth, index / u_nodeTexWidth), 0).xy;
}
`;

/** Applies the same CRT barrel the post pass uses, in clip space. */
const barrelChunk = glsl`
vec2 barrelClip(vec2 clip){
  vec2 c=clip*0.5;
  return (c/(1.0+dot(c,c)*${barrel}))*2.0;
}
`;

export const graphFieldVertexShader =
  header +
  glsl`
layout(location=0) in vec4 a_field;   // x, y, seed, depth layer
uniform float u_time,u_cam,u_pointScale,u_aspect,u_shiftX,u_flow;
uniform vec3 u_halo[${graphFieldHaloSlots}];   // clip x, clip y, radius
uniform int u_haloCount;
out float v_alpha,v_seed;
void main(){
  float depth=0.35+a_field.w*0.65;
  vec2 p=a_field.xy;
  float motionTime=u_time*u_flow;
  p.y+=(u_cam*0.16+motionTime*0.004)*depth;
  p.x+=0.028*depth*sin(motionTime*0.13+a_field.z*31.0+a_field.y*7.0);
  p.y+=0.014*depth*sin(motionTime*0.10+a_field.z*19.0);
  float t=motionTime*0.07;
  vec2 flow=vec2(sin(p.y*3.1+t)+0.5*sin(p.y*6.7-t*1.3+p.x*2.2),
                 cos(p.x*3.0-t*0.8)+0.5*cos(p.x*5.9+t+p.y*2.1));
  p+=flow*(0.035*depth*u_flow);
  p=fract(p);
  vec2 clip=p*2.0-1.0;
  float near=0.0;
  for(int i=0;i<${graphFieldHaloSlots};i++){
    if(i>=u_haloCount){ break; }
    float radius=max(u_halo[i].z,0.012);
    float rn=length((clip-u_halo[i].xy)*vec2(u_aspect,1.0))/radius;
    near=max(near,smoothstep(0.85,1.4,rn)*(1.0-smoothstep(1.4,2.5,rn)));
  }
  gl_Position=vec4(clip.x+u_shiftX*(0.35+depth*0.55),clip.y,0.0,1.0);
  gl_PointSize=(7.0+a_field.w*5.5)*u_pointScale;
  v_alpha=(0.46+a_field.w*0.52)*(0.8+0.2*sin(motionTime*1.1+a_field.z*44.0))*0.72*(1.0-near*0.55);
  v_seed=a_field.z;
}
`;

export const graphFieldFragmentShader =
  header +
  glsl`
precision highp float;
in float v_alpha,v_seed;
uniform vec3 u_near,u_far;
out vec4 o;
void main(){
  float r=length(gl_PointCoord-0.5)*2.0;
  float d=smoothstep(1.0,0.0,r);
  vec3 c=mix(u_near,u_far,0.25+0.5*v_seed);
  float a=v_alpha*d;
  o=vec4(c*a,a);
}
`;

export const graphEdgeVertexShader =
  header +
  glsl`
layout(location=0) in vec2 a_seg;      // t along the path, side
layout(location=1) in vec2 a_ends;     // from node index, to node index
layout(location=2) in vec2 a_lane;     // from lane x, to lane x
layout(location=3) in vec4 a_edge;     // child born, child terminal, confidence, phase
layout(location=4) in vec2 a_style;    // mode, channel
uniform float u_time,u_cam,u_aspect,u_width,u_shiftX,u_fitX,u_fitY,u_motion;
uniform vec3 u_modeColor[${modeCount}];
uniform vec2 u_channel[${channelCount}];
${nodeStateChunk}
${hashChunk}
out float v_recent,v_grow,v_along,v_failP,v_arrive;
out vec3 v_color;
void main(){
  vec2 stateA=nodeState(int(a_ends.x));
  vec2 stateB=nodeState(int(a_ends.y));
  float open=min(stateA.y,stateB.y);
  if(open<0.004){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }
  float animatedGrow=clamp((u_time-(a_edge.x-${edgeGrow}))/${edgeGrow},0.0,1.0);
  float grow=mix(step(a_edge.x,u_time),animatedGrow,u_motion);
  float tt=min(a_seg.x,grow);
  vec2 A=vec2(a_lane.x,${liveEdgeY}+(u_cam-stateA.x));
  vec2 B=vec2(a_lane.y,${liveEdgeY}+(u_cam-stateB.x));
  // Fitted, for the reason the node shader gives.
  if((A.y*u_fitY>1.35&&B.y*u_fitY>1.35)||(A.y*u_fitY<-1.35&&B.y*u_fitY<-1.35)){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }
  vec2 dS=normalize((B-A)*vec2(u_aspect,1.0)+vec2(1e-6));
  vec2 perpS=vec2(-dS.y,dS.x);
  vec2 perpC=vec2(perpS.x/u_aspect,perpS.y);
  float failP=0.0;
  if(a_edge.y<1e17){
    float animatedFail=smoothstep(a_edge.y,a_edge.y+0.35,u_time);
    failP=mix(step(a_edge.y,u_time),animatedFail,u_motion);
  }
  float unc=clamp((1.0-a_edge.z)+failP*0.85,0.0,1.0)*u_motion;
  float succ=step(${successMode}-0.5,a_style.x)*step(a_style.x,${successMode}+0.5);
  float arrive=exp(-max(0.0,u_time-a_edge.x)*4.2)*succ*u_motion;
  float wob=(sin(tt*9.0+a_edge.w*6.2832+u_time*unc*3.2)*0.05+sin(tt*19.0+a_edge.w*3.0)*0.02)*unc;
  vec2 channel=u_channel[int(a_style.y)];
  wob+=channel.y;
  wob*=sin(tt*3.14159);
  float seg=floor(tt*12.0), tick=floor(u_time*26.0);
  float bolt=(hash11(seg*7.13+tick*3.77+a_edge.w*11.0)-0.5)+(hash11(seg*2.31+tick*9.19)-0.5)*0.6;
  wob+=arrive*bolt*0.085*sin(tt*3.14159);
  vec2 p=mix(A,B,tt)+perpC*wob;
  float width=u_width*channel.x*(${f(graphEdgeGeometry.minimumWidth)}+a_edge.z*${f(graphEdgeGeometry.confidenceWidth)});
  vec2 e=p+perpC*a_seg.y*width;
  v_color=u_modeColor[int(a_style.x)];
  v_recent=exp(-max(0.0,u_cam-stateB.x)*0.9);
  v_grow=grow*open;
  v_along=a_seg.x;
  v_failP=failP;
  v_arrive=arrive;
  gl_Position=vec4(e.x*u_fitX+u_shiftX,e.y*u_fitY,0.0,1.0);
}
`;

export const graphEdgeFragmentShader =
  header +
  glsl`
precision highp float;
${hashChunk}
in float v_recent,v_grow,v_along,v_failP,v_arrive;
in vec3 v_color;
uniform float u_time,u_motion;
uniform vec3 u_failColor;
out vec4 o;
void main(){
  vec3 col=mix(v_color,u_failColor,v_failP);
  float drawn=step(v_along,v_grow+0.001);
  float dash=0.5+0.5*step(0.5,fract(v_along*13.0-u_time*1.4*u_motion));
  float lead=smoothstep(v_grow-0.16,v_grow,v_along)*drawn;
  float a=drawn*(0.52+v_recent*0.34)*dash*(1.0+v_failP*0.8)+lead*(0.9+v_recent*0.5);
  float tick=floor(u_time*26.0);
  float strobe=step(0.30,hash11(tick*1.37));
  float segB=0.30+0.70*hash11(floor(v_along*12.0)*5.7+tick*2.3);
  float elec=clamp(v_arrive*strobe*segB,0.0,1.0)*drawn;
  col=mix(col,vec3(0.90,1.0,0.94),clamp(elec*1.35,0.0,1.0));
  a+=elec*1.9;
  o=vec4(col*a,a);
}
`;

export const graphNodeVertexShader =
  header +
  glsl`
layout(location=0) in vec4 a_particle;   // direction x, direction y, phase, speed
layout(location=1) in float a_particleRole;   // 0 core, 1 spark, 2 orbital
layout(location=2) in vec4 a_node;       // lane x, born, settle, terminal
layout(location=3) in vec4 a_style;      // mode, glyph, role, emphasis
layout(location=4) in float a_detail;
uniform float u_time,u_cam,u_pointScale,u_shiftX,u_fitX,u_fitY,u_scale,u_maxPoint,u_motion,u_listen;
uniform float u_hoverX,u_hoverY,u_hoverAmount;
uniform int u_instanceBase;   // first drawn node; the visible slice starts here
uniform vec3 u_modeColor[${modeCount}];
uniform vec3 u_role[${roleCount}];
uniform vec3 u_emphasis[${emphasisCount}];
uniform vec3 u_detail[${detailCount}];
${nodeStateChunk}
${hashChunk}
out float v_recent,v_alpha,v_active,v_hover,v_fail,v_isCore,v_eclipse,v_ring,v_dashes,v_bodyAlpha;
out vec3 v_color;
void main(){
  int nodeIndex=u_instanceBase+gl_InstanceID;
  vec2 state=nodeState(nodeIndex);
  float open=state.y;
  vec3 detail=u_detail[int(a_detail)];
  vec3 role=u_role[int(a_style.z)];
  // Per-node level of detail: the body always draws, and the surrounding
  // particles are kept by a stable per-slot draw so a compacted row costs less
  // without the cluster reshuffling every frame.
  float budget=a_particleRole<0.5?1.0:role.z*detail.z;
  if(open<0.004||hash11(float(gl_VertexID)*0.517+1.7)>budget){
    gl_Position=vec4(2.0,2.0,2.0,1.0); gl_PointSize=0.0; return;
  }
  float born=a_node.y, settle=a_node.z, terminal=a_node.w;
  float age=u_time-born;
  float visualAge=mix(step(0.0,age),age,u_motion);
  float motionTime=mix(born,u_time,u_motion);
  float jitter=hash11(float(nodeIndex)*0.373+0.11);
  float phase=fract(a_particle.z+jitter);
  float animatedVis=step(born-step(0.5,a_particleRole)*step(a_particleRole,1.5)*0.55,u_time);
  float vis=mix(step(born,u_time),animatedVis,u_motion);
  float recent=exp(-max(0.0,u_cam-state.x)*0.85);
  float working=smoothstep(born,born+0.45,u_time)*(1.0-smoothstep(settle-0.35,settle+0.7,u_time))*u_motion;
  float rise=mix(step(0.0,age),smoothstep(0.0,0.10,age),u_motion);
  float settlePop=exp(-max(age-0.10,0.0)*6.0)*u_motion;
  float pop=rise*(1.0+0.55*settlePop);
  vec2 center=vec2(a_node.x,${liveEdgeY}+(u_cam-state.x));
  // Culled where it is drawn. The fit compresses the graph toward the centre,
  // so testing the world offset threw away nodes that the fitted position puts
  // well inside the viewport — most visibly on a tall, narrow window, where the
  // fit is smallest and the discarded band is widest.
  if(abs(center.y*u_fitY)>1.3){ gl_Position=vec4(2.0,2.0,2.0,1.0); gl_PointSize=0.0; return; }
  float hover=exp(-distance(vec2(a_node.x,state.x),vec2(u_hoverX,u_hoverY))*20.0)*u_hoverAmount;
  float failing=step(terminal,1e17);
  float failAge=0.0;
  float failP=0.0;
  if(failing>0.5){
    failAge=mix(step(terminal,u_time),u_time-terminal,u_motion);
    failP=mix(step(0.0,failAge),smoothstep(0.0,0.35,failAge),u_motion);
  }
  vec2 dir=vec2(a_particle.x,a_particle.y);
  vec2 perp=vec2(-dir.y,dir.x);
  float bodySize=(${f(40)}+recent*${f(20)}+working*${f(58)}+hover*${f(38)}+role.x)*detail.x;
  vec2 pos; float psize; float palpha;
  if(failing>0.5&&failAge>0.0){
    if(a_particleRole<0.5){
      pos=center; psize=bodySize*pop*0.72; palpha=1.0;
    } else if(u_motion<0.5){
      pos=center; psize=0.0; palpha=0.0;
    } else {
      float burst=exp(-failAge*2.2);
      vec2 burstPos=center+dir*(0.02+failAge*0.16);
      float t2=fract(failAge*0.25+phase);
      float ang=phase*6.2832+t2*5.2+failAge*0.7;
      vec2 suckPos=center+vec2(cos(ang),sin(ang))*mix(0.085,0.004,t2);
      float focus=clamp(recent*0.9+hover,0.0,1.0);
      pos=mix(suckPos,burstPos,burst);
      palpha=mix(focus*(1.0-t2)*0.6,1.15*exp(-failAge*1.2),burst);
      psize=mix((3.0+recent*3.5)*(0.35+(1.0-t2)*0.8),6.5+recent*10.0,burst);
    }
  } else if(a_particleRole<0.5){
    // The listening node breathes only while the app is actually hearing the
    // user (mockup line 622: listen*u_listen); an idle input node holds still.
    float listening=step(${listeningMode}-0.5,a_style.x);
    float calm=1.0+listening*0.32*abs(sin(u_time*6.0))*u_motion*u_listen;
    pos=center; psize=bodySize*pop*calm; palpha=1.0;
  } else if(a_particleRole<1.5){
    float act=working;
    float toBirth=born-u_time;
    if(toBirth>0.0){
      float suck=clamp(toBirth/0.55,0.0,1.0);
      float spin=phase*6.2832+toBirth*9.0;
      pos=center+vec2(cos(spin),sin(spin))*(suck*0.10);
      palpha=(1.0-suck)*0.9+0.08;
      psize=(2.5+recent*3.0)*(0.45+(1.0-suck)*0.8);
    } else {
      float et=visualAge;
      float flash=16.0*et*exp(-et*13.0)*u_motion;
      float pt=fract(motionTime*a_particle.w*(0.18+act*0.18)+phase);
      float cloudFade=smoothstep(0.25,0.70,et);
      vec2 cloudOff=dir*(0.35+pt*0.65)+perp*0.30*sin(motionTime*0.7+phase*20.0);
      float cloudR=0.020+act*0.070+recent*0.020+hover*0.02;
      vec2 restPos=center+cloudOff*cloudR*pop*cloudFade;
      float restAlpha=(1.0-pt)*(0.15+act*0.9*cloudFade+recent*0.25+hover*0.4);
      float restSize=(3.2+recent*5.0+act*4.0)*pop;
      float succ=step(${successMode}-0.5,a_style.x)*step(a_style.x,${successMode}+0.5);
      float petal=1.0+succ*(0.8+0.6*sin(phase*18.85));
      pos=restPos+dir*(flash*1.3*0.16*(1.0+succ*2.4)*petal);
      palpha=max(flash*1.3,0.0)*(1.0+succ*0.7)+restAlpha;
      psize=restSize+flash*8.0*pop*(1.0+succ*1.1);
    }
  } else {
    float on=clamp(working+hover,0.0,1.0);
    float ang=motionTime*a_particle.w*1.5+phase*6.2832;
    vec2 ell=vec2(cos(ang),sin(ang)*(0.3+0.5*fract(phase*7.0)));
    float ca=cos(a_particle.x*3.1416), sa=sin(a_particle.x*3.1416);
    vec2 rot=vec2(ell.x*ca-ell.y*sa,ell.x*sa+ell.y*ca);
    pos=center+rot*((0.045+recent*0.014+working*0.032)*pop);
    psize=(3.5+recent*4.0)*pop*on;
    palpha=on*(0.6+recent*0.3);
  }
  vec3 emphasis=u_emphasis[int(a_style.w)];
  float succF=step(${successMode}-0.5,a_style.x)*step(a_style.x,${successMode}+0.5);
  psize*=(1.0+succF*0.5);
  v_color=u_modeColor[int(a_style.x)]*detail.y;
  v_recent=recent; v_active=working; v_hover=hover; v_fail=failP;
  v_alpha=palpha*vis*open;
  v_isCore=step(a_particleRole,0.5);
  float animatedEclipse=smoothstep(0.0,1.1,age);
  float eclipse=mix(step(0.0,age),animatedEclipse,u_motion);
  v_eclipse=max(step(${failMode}-0.5,a_style.x)*step(a_style.x,${failMode}+0.5)*eclipse,failP)*step(a_particleRole,0.5);
  v_ring=emphasis.x; v_dashes=emphasis.y; v_bodyAlpha=emphasis.z;
  gl_Position=vec4(pos.x*u_fitX+u_shiftX,pos.y*u_fitY,0.0,1.0);
  gl_PointSize=min(u_maxPoint,psize*u_pointScale*vis*u_scale);
}
`;

export const graphNodeFragmentShader =
  header +
  glsl`
precision highp float;
in float v_recent,v_alpha,v_active,v_hover,v_fail,v_isCore,v_eclipse,v_ring,v_dashes,v_bodyAlpha;
in vec3 v_color;
uniform vec3 u_failColor;
out vec4 o;
void main(){
  vec3 col=mix(v_color,u_failColor,v_fail);
  vec2 offset=gl_PointCoord-0.5;
  float r=length(offset)*2.0;
  float glow=smoothstep(1.0,0.0,r);
  float disc=smoothstep(0.55,0.42,r);
  float core=smoothstep(0.0,0.34,r);
  float bodyCore=disc*mix(0.07,1.0,core);
  float body=mix(disc,bodyCore,v_isCore)*mix(1.0,v_bodyAlpha,v_isCore);
  if(v_isCore>0.5&&v_ring>0.001){
    float ringR=0.62;
    float ring=smoothstep(v_ring*0.5,0.0,abs(r-ringR));
    if(v_dashes>0.5){
      float angle=atan(offset.y,offset.x)/6.2832+0.5;
      ring*=step(0.5,fract(angle*v_dashes));
    }
    body=max(body,ring*0.85);
  }
  if(v_eclipse>0.001){
    vec2 sc=offset*2.0+vec2(0.10,0.16)*v_eclipse;
    float sd=length(sc), shR=0.30+v_eclipse*0.30;
    float inShadow=smoothstep(shR+0.05,shR-0.05,sd);
    float rim=smoothstep(0.09,0.0,abs(sd-shR));
    body=mix(body,disc*(1.0-inShadow)+disc*rim,v_eclipse);
    col=mix(col,vec3(1.0,0.52,0.44),rim*v_eclipse*0.9);
  }
  float a=v_alpha*(glow*(0.30+v_recent*0.22)*(1.0-v_isCore*0.72)+body*(1.4+v_recent*0.6));
  col*=(1.1+v_active*0.35+v_hover*0.6);
  o=vec4(col*a,a);
}
`;

export const graphGlyphVertexShader =
  header +
  glsl`
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_node;    // lane x, born, settle, terminal
layout(location=2) in vec4 a_style;   // mode, glyph, role, emphasis
layout(location=3) in float a_detail;
uniform float u_time,u_cam,u_aspect,u_glyphCount,u_shiftX,u_glyphY,u_fitX,u_fitY,u_motion;
uniform int u_instanceBase;
uniform vec3 u_role[${roleCount}];
uniform vec3 u_detail[${detailCount}];
uniform vec3 u_modeColor[${modeCount}];
${nodeStateChunk}
${barrelChunk}
out vec2 v_uv;
out float v_reveal,v_fail;
out vec3 v_color;
void main(){
  vec2 state=nodeState(u_instanceBase+gl_InstanceID);
  if(state.y<0.004){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }
  float born=a_node.y, settle=a_node.z, terminal=a_node.w;
  float age=u_time-born;
  float visualAge=mix(step(0.0,age),age,u_motion);
  float vis=step(0.0,age);
  float recent=exp(-max(0.0,u_cam-state.x)*0.85);
  float working=smoothstep(born,born+0.45,u_time)*(1.0-smoothstep(settle-0.35,settle+0.7,u_time))*u_motion;
  float rise=mix(step(0.0,age),smoothstep(0.0,0.10,age),u_motion);
  float pop=rise*(1.0+0.55*exp(-max(age-0.10,0.0)*6.0)*u_motion);
  float failing=step(terminal,1e17);
  float failAge=0.0;
  v_fail=0.0;
  if(failing>0.5){
    failAge=mix(step(terminal,u_time),u_time-terminal,u_motion);
    v_fail=mix(step(0.0,failAge),smoothstep(0.0,0.35,failAge),u_motion);
  }
  vec3 role=u_role[int(a_style.z)];
  vec3 detail=u_detail[int(a_detail)];
  float halfY=(0.020+recent*0.006+working*0.017)*pop*u_glyphY*role.y*detail.x;
  float halfX=halfY/u_aspect;
  vec2 center=vec2(a_node.x*u_fitX,(${liveEdgeY}+(u_cam-state.x))*u_fitY);
  if(center.y>1.35||center.y<-1.35){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }
  vec2 pos=center+vec2(a_corner.x*halfX,a_corner.y*halfY);
  v_uv=vec2((a_style.y+(a_corner.x*0.5+0.5))/u_glyphCount,1.0-(a_corner.y*0.5+0.5));
  v_color=u_modeColor[int(a_style.x)]*detail.y;
  v_reveal=mix(step(0.0,visualAge),smoothstep(0.06,0.30,visualAge),u_motion)*vis*state.y;
  vec2 warped=barrelClip(pos);
  gl_Position=vec4(warped.x+u_shiftX,warped.y,0.0,1.0);
}
`;

export const graphGlyphFragmentShader =
  header +
  glsl`
precision highp float;
in vec2 v_uv;
in float v_reveal,v_fail;
in vec3 v_color;
uniform sampler2D u_atlas;
uniform float u_scanlines;
out vec4 o;
void main(){
  float mask=texture(u_atlas,v_uv).a*v_reveal;
  float ink=smoothstep(0.28,0.5,mask);
  vec3 col=mix(v_color,vec3(1.0),0.5);
  col=mix(col,vec3(0.5,0.28,0.30),v_fail);
  col*=mix(1.0,0.55,v_fail);
  col*=mix(1.0,0.82+0.18*step(1.0,mod(gl_FragCoord.y,3.0)),u_scanlines);
  o=vec4(col,ink);
}
`;

export const graphPostVertexShader =
  header +
  glsl`
out vec2 v_uv;
void main(){
  vec2 c=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  v_uv=c;
  gl_Position=vec4(c*2.0-1.0,0.0,1.0);
}
`;

export const graphPostFragmentShader =
  header +
  glsl`
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_pixel,u_scanlines,u_time,u_glitch,u_grain,u_barrel;
out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){
  float px=max(1.0,u_pixel);
  vec2 uv=gl_FragCoord.xy/u_res;
  vec2 cc=uv-0.5;
  vec2 uvw=cc*(1.0+dot(cc,cc)*u_barrel)+0.5;
  if(uvw.x<0.0||uvw.x>1.0||uvw.y<0.0||uvw.y>1.0){ o=vec4(0.0,0.0,0.0,1.0); return; }
  uvw.x+=u_glitch*0.035*(hash(vec2(floor(uvw.y*46.0),floor(u_time*22.0)))-0.5)
        *step(0.55,hash(vec2(floor(uvw.y*9.0),floor(u_time*6.0))));
  vec2 fc=uvw*u_res;
  vec2 fromCenter=uvw-0.5;
  vec2 cell=floor(fc/px);
  vec2 base=(cell*px+px*0.5)/u_res;
  vec2 ab=fromCenter*(0.012+u_glitch*0.03);
  vec3 s;
  s.r=texture(u_tex,base+ab).r;
  s.g=texture(u_tex,base).g;
  s.b=texture(u_tex,base-ab).b;
  vec3 col=s*1.7;
  col=col/(1.0+col);
  float lum=dot(col,vec3(0.3,0.59,0.11));
  vec2 fpx=fract(fc/px)-0.5;
  float radius=sqrt(clamp(lum,0.0,1.0))*0.95;
  float ink=smoothstep(radius+0.12,radius-0.12,length(fpx)*2.0);
  col*=ink;
  col*=mix(1.0,0.72+0.28*step(1.0,mod(fc.y,3.0)),u_scanlines);
  col*=smoothstep(1.5,0.12,length(fromCenter*vec2(1.05,1.0)));
  col+=(hash(fc+fract(u_time))-0.5)*0.013*u_grain;
  o=vec4(col,1.0);
}
`;
