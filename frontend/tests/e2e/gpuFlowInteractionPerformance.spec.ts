import { test } from "@playwright/test";
import {
  benchmarkNestedSectionResize,
  benchmarkParameterDragDrop,
  benchmarkSectionDragDrop,
  benchmarkSliderInput,
  benchmarkTextInput,
  benchmarkTopLevelSectionResize,
  benchmarkViewportPanZoom,
  benchmarkWheelScroll,
  createGpuFlowInteractionStressProject,
  type GpuFlowInteractionBenchmarkSummary,
} from "./gpuFlowInteractionBenchmark";
import {
  installGpuFlowPerformanceProbe,
  uninstallGpuFlowPerformanceProbe,
} from "./gpuFlowPerformanceProbe";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
} from "./helpers";

const RUN_INTERACTION_BENCHMARKS =
  process.env.SETTA_GPUFLOW_INTERACTION_BENCHMARK === "1";

test.describe("GpuFlow interaction performance benchmark", () => {
  test.skip(
    !RUN_INTERACTION_BENCHMARKS,
    "Set SETTA_GPUFLOW_INTERACTION_BENCHMARK=1 to run explicit performance benchmarks.",
  );

  test("records stress project interaction metrics", async ({ page }) => {
    test.setTimeout(240_000);
    await ensureAppReady(page);
    await installGpuFlowPerformanceProbe(page);
    const projectContext = await openIsolatedProject(page);
    const summaries: GpuFlowInteractionBenchmarkSummary[] = [];

    try {
      const stressProject = await createGpuFlowInteractionStressProject(
        page,
        projectContext.projectConfigId,
      );
      summaries.push(await benchmarkTopLevelSectionResize(page, stressProject));
      summaries.push(await benchmarkNestedSectionResize(page, stressProject));
      summaries.push(await benchmarkSectionDragDrop(page, stressProject));
      summaries.push(await benchmarkParameterDragDrop(page, stressProject));
      summaries.push(await benchmarkViewportPanZoom(page, stressProject));
      summaries.push(await benchmarkWheelScroll(page, stressProject));
      summaries.push(await benchmarkSliderInput(page, stressProject));
      summaries.push(await benchmarkTextInput(page, stressProject));

      console.info(
        `GPU_FLOW_INTERACTION_BENCHMARK ${JSON.stringify({
          projectConfigId: projectContext.projectConfigId,
          summaries,
        })}`,
      );
    } finally {
      await cleanupIsolatedProject(page, projectContext);
      await uninstallGpuFlowPerformanceProbe(page).catch(() => undefined);
    }
  });
});
