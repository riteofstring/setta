import { Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { LocalAuthGuard } from 'src/auth/local-auth.guard';
import { CodeGeneratorService } from 'src/codeGenerator/codeGenerator.service';
import { CodeInfoService } from 'src/codeInfo/codeInfo.service';
import { ProjectsService } from 'src/projects/projects.service';

@Controller()
export class AppController {
  constructor(
    private authService: AuthService,
    private projectsService: ProjectsService,
    private codeInfoService: CodeInfoService,
    private codeGeneratorService: CodeGeneratorService,
  ) {}

  @UseGuards(LocalAuthGuard)
  @Post('auth/login')
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Post('auth/register')
  async register(@Request() req) {
    return this.authService.register(req.body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('')
  verifyToken(@Request() req) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('projects')
  getProjects(@Request() req) {
    return this.projectsService.getAllByOwner(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('projects/load/:id')
  loadProject(@Request() req, @Param('id') id: string) {
    return this.projectsService.loadOne(req.user, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('projects/save')
  saveProject(@Request() req) {
    return this.projectsService.save(req.body.project);
  }

  @UseGuards(JwtAuthGuard)
  @Post('projects/createProject')
  createProject(@Request() req) {
    return this.projectsService.createProject(req.user, req.body.name);
  }

  @Post('codeInfo/getCollectionsAndModules')
  getCollectionsAndModules(@Request() req) {
    return this.codeInfoService.getCollectionsAndModules(req.body.searchTerm);
  }

  @Post('codeInfo/getCollectionDetails')
  getCollectionDetails(@Request() req) {
    return this.codeInfoService.getCollectionDetails(req.body.codeInfoId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('codeGenerator/generateCode')
  generateCode(@Request() req) {
    return this.codeGeneratorService.generateCode(
      req.user,
      req.body.codeId,
      req.body.codeJson,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('codeGenerator/getCode')
  getCode(@Request() req) {
    return this.codeGeneratorService.getCode(req.user, req.body.codeId);
  }
}
