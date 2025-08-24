import _ from "lodash";
import {
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useLocalPendingValue } from "state/hooks/utils";
import { route_set_social_url } from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";

export function SocialAreaSettings({ sectionId }) {
  const url = useProjectState((p) => {
    const impl = getCurrEffectiveSectionImplOfType(
      p,
      sectionId,
      SectionTypeEnum.Social,
    );
    return impl.url;
  });

  const [value, setPendingValue] = useLocalPendingValue(url, (x) =>
    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue<"SocialSection">(state, sectionId, {
        url: x,
      });
    }),
  );

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
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
        />
      </div>
    </div>
  );
}

const debouncedSetSocialUrl = _.debounce(
  (sectionId, url) =>
    route_set_social_url({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      url,
    }),
  500,
);
