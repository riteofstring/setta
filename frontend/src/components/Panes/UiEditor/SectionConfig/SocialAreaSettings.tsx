import _ from "lodash";
import { setSocialUrl } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  getCurrSectionVariantId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { useLocalPendingValue } from "state/hooks/utils";
import { SectionTypeEnum } from "utils/generatedTypes";
export function SocialAreaSettings({ sectionId }) {
  const { canEditStructure } = useShareCapabilities();
  const { url, sectionVariantId } = useProjectState((p) => {
    const impl = getCurrEffectiveSectionImplOfType(
      p,
      sectionId,
      SectionTypeEnum.Social,
    );
    return {
      url: impl.url,
      sectionVariantId: getCurrSectionVariantId(p, sectionId),
    };
  });
  const [value, setPendingValue] = useLocalPendingValue(
    url,
    (x) =>
      useProjectState.setState((state) => {
        setCurrEffectiveSectionImplValue<"SocialSection">(state, sectionId, {
          url: x,
        });
      }),
    sectionVariantId,
  );
  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!canEditStructure) {
      return;
    }
    setPendingValue(e.target.value);
    debouncedSetSocialUrl(sectionId, e.target.value);
  }
  return (
    <div className="mb-2 mt-2 w-full select-text">
      <div className="flex w-full items-center gap-3">
        <p className="select-none  text-sm font-bold text-setta-400 dark:text-setta-600">
          Social Media URL
        </p>
        <input
          className="mr-[2px] w-full truncate rounded-full bg-white px-4 py-1 text-sm text-setta-700 ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 dark:bg-setta-900 dark:text-setta-400 dark:ring-setta-700"
          value={value}
          // onChange={(e) => setValue(e.target.value)}
          onChange={onChange}
          placeholder="https://www.youtube.com/"
          disabled={!canEditStructure}
        />
      </div>
    </div>
  );
}
const debouncedSetSocialUrl = _.debounce((sectionId, url) => {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"SocialSection">(state, sectionId, {
        url,
      });
    },
    send: (frontendOpId) =>
      callOpenAPI(
        setSocialUrl({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            url,
            frontendOpId,
          },
        } as Parameters<typeof setSocialUrl>[0]),
      ),
  });
}, 500);
