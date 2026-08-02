import {
  createLibrary,
  defineComponent,
  type ComponentRenderer,
  type Library,
} from "@openuidev/react-lang";

import { artifactRenderers } from "./artifact-renderers";
import { artifactCatalogRootComponent } from "./generated/artifact-catalog";
import { artifactComponentPropsSchemas } from "./generated/artifact-catalog-props";
import { artifactCatalogSignatures } from "./generated/artifact-catalog-signatures";

/**
 * The OpenUI library for catalog `setta.artifacts.v1`.
 *
 * Every half of it is generated from the Go catalog except the renderers: the
 * component names, their props schemas, the summaries, and the root all come
 * from the same owner the backend compiles against, so the library the
 * renderer parses with cannot drift from the one the model was given.
 */
export function createArtifactLibrary(): Library {
  return createLibrary({
    components: artifactCatalogSignatures.map((signature) =>
      defineComponent({
        name: signature.component,
        props: artifactComponentPropsSchemas[signature.component],
        description: signature.summary,
        // Each renderer is typed against its own component's props, but a
        // component picked out of the catalog list is a union of all of them,
        // which no signature can correlate. The map itself is what holds a
        // renderer to its props.
        component: artifactRenderers[signature.component] as ComponentRenderer,
      }),
    ),
    root: artifactCatalogRootComponent,
  });
}
