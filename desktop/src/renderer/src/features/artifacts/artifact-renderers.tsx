import type { ComponentRenderProps, ElementNode } from "@openuidev/react-lang";

import { SettaStatusBadge } from "@renderer/components/setta-status-badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@renderer/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@renderer/components/ui/card";
import { Separator } from "@renderer/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renderer/components/ui/tabs";

import { ArtifactCategoryChart, ArtifactPieChart } from "./components/artifact-chart";
import {
  ArtifactCodeBlock,
  ArtifactFileReference,
  ArtifactMarkdown,
} from "./components/artifact-content";
import { ArtifactAlert, ArtifactMetric } from "./components/artifact-data";
import {
  ArtifactDocument,
  ArtifactGrid,
  ArtifactHeading,
  ArtifactSection,
  ArtifactStack,
  ArtifactText,
} from "./components/artifact-layout";
import { ArtifactTable } from "./components/artifact-table";
import type { ArtifactComponentName } from "./generated/artifact-catalog";
import type { ArtifactComponentProps } from "./generated/artifact-catalog-props";

/**
 * One catalog component's renderer.
 *
 * `renderNode` is how a container renders the child nodes the parser handed it;
 * `statementId` is the parser's own bookkeeping and no renderer needs it.
 */
type ArtifactRenderer<Name extends ArtifactComponentName> = (
  props: ComponentRenderProps<ArtifactComponentProps[Name]>,
) => React.ReactNode;

/**
 * Every model-visible component's renderer.
 *
 * The map is keyed by the generated component-name union, so a catalog addition
 * that has no renderer is a compile error rather than a component the document
 * silently drops.
 */
export const artifactRenderers = {
  Document: ({ props, renderNode }) => (
    <ArtifactDocument>{renderNode(props.blocks)}</ArtifactDocument>
  ),
  Section: ({ props, renderNode }) => (
    <ArtifactSection title={props.title}>{renderNode(props.blocks)}</ArtifactSection>
  ),
  Heading: ({ props }) => <ArtifactHeading level={props.level ?? "section"} text={props.text} />,
  Text: ({ props }) => <ArtifactText text={props.text} tone={props.tone ?? "normal"} />,
  Markdown: ({ props }) => <ArtifactMarkdown source={props.source} />,
  CodeBlock: ({ props }) => (
    <ArtifactCodeBlock
      caption={props.caption ?? undefined}
      code={props.code}
      language={props.language ?? "text"}
    />
  ),
  FileReference: ({ props }) => (
    <ArtifactFileReference description={props.description ?? undefined} path={props.path} />
  ),
  Stack: ({ props, renderNode }) => (
    <ArtifactStack gap={props.gap ?? "comfortable"}>{renderNode(props.blocks)}</ArtifactStack>
  ),
  Grid: ({ props, renderNode }) => (
    <ArtifactGrid columns={props.columns ?? 2}>{renderNode(props.blocks)}</ArtifactGrid>
  ),
  Card: ({ props, renderNode }) => (
    /*
     * A card is a margin note: a rule above it and a tracked label, the way the
     * mockup sets an aside. A bordered box on every one of these is what turned
     * a document into a page of boxes stacked on boxes, and the box was never
     * the informative part — the label is.
     */
    <Card
      className="gap-[9px] rounded-none border-0 border-t border-border bg-transparent px-0 py-0 pt-[12px] shadow-none"
      size="sm"
    >
      <CardHeader className="px-0">
        <CardTitle className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {props.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-[10px] px-0">
        {renderNode(props.blocks)}
      </CardContent>
    </Card>
  ),
  Separator: () => <Separator />,
  Tabs: ({ props, renderNode }) => (
    <Tabs defaultValue={tabValue(0)}>
      <div className="max-w-full overflow-x-auto overscroll-x-contain pb-1">
        <TabsList>
          {props.tabs.map((tab, index) => (
            <TabsTrigger key={tabValue(index)} value={tabValue(index)}>
              {childProps(tab, "Tab").label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {props.tabs.map((tab, index) => (
        <TabsContent
          className="focus-visible:outline-2 focus-visible:outline-offset-2"
          key={tabValue(index)}
          value={tabValue(index)}
        >
          {renderNode(tab)}
        </TabsContent>
      ))}
    </Tabs>
  ),
  Tab: ({ props, renderNode }) => (
    <div className="flex flex-col gap-3 pt-1">{renderNode(props.blocks)}</div>
  ),
  Accordion: ({ props, renderNode }) => (
    <Accordion>
      {props.items.map((item, index) => (
        <AccordionItem key={itemValue(index)} value={itemValue(index)}>
          <AccordionTrigger>{childProps(item, "AccordionItem").label}</AccordionTrigger>
          <AccordionContent>{renderNode(item)}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  ),
  AccordionItem: ({ props, renderNode }) => (
    <div className="flex flex-col gap-3">{renderNode(props.blocks)}</div>
  ),
  Metric: ({ props }) => (
    <ArtifactMetric
      caption={props.caption ?? undefined}
      label={props.label}
      tone={props.tone ?? "neutral"}
      value={props.value}
    />
  ),
  Badge: ({ props }) => (
    <SettaStatusBadge tone={props.tone ?? "neutral"}>{props.label}</SettaStatusBadge>
  ),
  Alert: ({ props }) => (
    <ArtifactAlert body={props.body} title={props.title} tone={props.tone ?? "info"} />
  ),
  Table: ({ props }) => (
    <ArtifactTable caption={props.caption ?? undefined} columns={props.columns} rows={props.rows} />
  ),
  BarChart: ({ props }) => (
    <ArtifactCategoryChart caption={props.caption ?? undefined} kind="bar" series={props.series} />
  ),
  LineChart: ({ props }) => (
    <ArtifactCategoryChart caption={props.caption ?? undefined} kind="line" series={props.series} />
  ),
  AreaChart: ({ props }) => (
    <ArtifactCategoryChart caption={props.caption ?? undefined} kind="area" series={props.series} />
  ),
  PieChart: ({ props }) => (
    <ArtifactPieChart caption={props.caption ?? undefined} slices={props.slices} />
  ),
} satisfies { readonly [Name in ArtifactComponentName]: ArtifactRenderer<Name> };

/**
 * Reads a child node's props where a container needs them itself.
 *
 * Tabs and Accordion render their own triggers, so they read the label off a
 * child the parser typed only as a node. The catalog admits exactly one child
 * component in each of those slots, so a different one is a broken document
 * rather than something to render around.
 */
function childProps<Name extends ArtifactComponentName>(
  node: ElementNode,
  name: Name,
): ArtifactComponentProps[Name] {
  if (node.typeName !== name) {
    throw new Error(`artifact document nested ${node.typeName} where only ${name} is valid`);
  }
  return node.props as ArtifactComponentProps[Name];
}

function tabValue(index: number): string {
  return `tab-${index}`;
}

function itemValue(index: number): string {
  return `item-${index}`;
}
