import { describe, expect, it } from "vitest";

import {
  resolveRenderedSkillPreviewContent,
  resolveSelectedSkillViewStateAfterUpsertedSkillResponse,
  resolveSkillMarkdownRawDraftBySkillIdHydration,
  resolveSkillMarkdownRawDraftBySkillIdReplace,
  resolveSkillMarkdownRawDraftBySkillIdUpdate,
  resolveSkillPreviewContent,
  upsertAppGenSkillEntry,
} from "./ProjectChatSkillsMcpViewer";

describe("project chat skills viewer upsert response integration", () => {
  it("updates the saved skill cache and draft without disturbing a newer selection", () => {
    const alphaSkill = {
      skillId: "user_agents_skills::alpha-custom",
      name: "alpha-custom",
      rootLabel: "User ~/.agents/skills",
      rootPath: "/home/.agents/skills",
      relativePath: "alpha-custom",
      isEditable: true,
      editabilityReason: null,
      description: "Alpha custom skill",
    };
    const betaSkill = {
      skillId: "user_agents_skills::beta-custom",
      name: "beta-custom",
      rootLabel: "User ~/.agents/skills",
      rootPath: "/home/.agents/skills",
      relativePath: "beta-custom",
      isEditable: true,
      editabilityReason: null,
      description: "Beta custom skill",
    };
    const savedAlphaSkill = {
      ...alphaSkill,
      description: "Alpha saved description",
    };
    const savedAlphaContent = "# alpha-custom\n\nAlpha saved update";
    const nextSkills = upsertAppGenSkillEntry(
      [alphaSkill, betaSkill],
      savedAlphaSkill,
    );
    const nextDraftState = resolveSkillMarkdownRawDraftBySkillIdReplace({
      skillMarkdownDraftStateBySkillId: {
        [alphaSkill.skillId]: {
          draft: savedAlphaContent,
          loadedContent: "# alpha-custom\n\nAlpha initial body",
        },
        [betaSkill.skillId]: {
          draft: "# beta-custom\n\nBeta stable body",
          loadedContent: "# beta-custom\n\nBeta stable body",
        },
      },
      skillId: alphaSkill.skillId,
      nextRawDraft: savedAlphaContent,
    });
    const nextSelectedSkillViewState =
      resolveSelectedSkillViewStateAfterUpsertedSkillResponse({
        currentSelectedSkillId: betaSkill.skillId,
        requestSkillId: alphaSkill.skillId,
        selectUpdatedSkill: false,
        skill: savedAlphaSkill,
        skillContent: {
          skillId: alphaSkill.skillId,
          content: savedAlphaContent,
          truncated: false,
          originalSizeBytes: savedAlphaContent.length,
        },
      });

    expect(nextSkills.map((skill) => skill.skillId)).toEqual([
      alphaSkill.skillId,
      betaSkill.skillId,
    ]);
    expect(nextSkills[0]?.description).toBe("Alpha saved description");
    expect(nextDraftState?.[alphaSkill.skillId]).toEqual({
      draft: savedAlphaContent,
      loadedContent: savedAlphaContent,
    });
    expect(nextDraftState?.[betaSkill.skillId]).toEqual({
      draft: "# beta-custom\n\nBeta stable body",
      loadedContent: "# beta-custom\n\nBeta stable body",
    });
    expect(nextSelectedSkillViewState).toBeNull();
  });

  it("keeps rendered preview aligned with unsaved raw edits for the active skill", () => {
    const skillId = "user_agents_skills::alpha-custom";
    const hydratedDraftState = resolveSkillMarkdownRawDraftBySkillIdHydration({
      skillMarkdownDraftStateBySkillId: {},
      skillId,
      skillContent: "# alpha-custom\n\nOriginal",
    });
    const dirtyDraftState = resolveSkillMarkdownRawDraftBySkillIdUpdate({
      skillMarkdownDraftStateBySkillId: hydratedDraftState ?? {},
      skillId,
      nextRawDraft: "# alpha-custom\n\nUpdated draft",
    });
    const skillPreviewContent = resolveSkillPreviewContent({
      skillContentLoading: false,
      skillsLoading: false,
      selectedSkillId: skillId,
      skillContentLoadStatus: "loaded",
      selectedSkillContent: "# alpha-custom\n\nOriginal",
    });
    const renderedPreview = resolveRenderedSkillPreviewContent({
      skillPreviewContent,
      skillMarkdownRawDraft: dirtyDraftState?.[skillId]?.draft ?? null,
      selectedSkillId: skillId,
      skillContentLoadStatus: "loaded",
    });

    expect(dirtyDraftState?.[skillId]).toEqual({
      draft: "# alpha-custom\n\nUpdated draft",
      loadedContent: "# alpha-custom\n\nOriginal",
    });
    expect(renderedPreview).toBe("# alpha-custom\n\nUpdated draft");
  });
});
