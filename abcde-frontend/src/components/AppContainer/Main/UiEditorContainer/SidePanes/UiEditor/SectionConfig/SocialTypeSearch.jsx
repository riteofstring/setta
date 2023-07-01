import { useGetSectionTypeConfig } from "hooks/useSectionType";
import { youtubeSectionAspectRatio } from "hooks/useSocialUtils";
import {
  SOCIAL_TYPES,
  useSectionSocialConfig,
} from "models/info/sectionSocialConfig";
import { setSectionSize } from "thunks/sections/sections";
import { setSectionUITypeConfig } from "thunks/uiTypes";
import { SectionConfigSearch } from "./SectionConfigSearch";

export function SocialTypeSearch({ sectionId }) {
  const selected = useGetSectionTypeConfig(sectionId, "social");
  const initSocialConfig = useSectionSocialConfig((x) => x.initConfig);

  function onSelectionChange({ id, newValueFn }) {
    setSectionUITypeConfig({
      sectionId,
      configProps: {
        configName: "social",
        newValueFn,
      },
    });
    initSocialConfig({ sectionId, id });

    const width = 550;
    const height =
      id === "twitter" ? "auto" : 500 * (1 / youtubeSectionAspectRatio);

    setSectionSize(sectionId, { width, height });
  }

  return (
    <SectionConfigSearch
      sectionId={sectionId}
      onSelectionChange={onSelectionChange}
      onSearch={() => {}}
      selected={[selected]}
      results={SOCIAL_TYPES}
      isCheckbox={false}
      DetailsComponent={getSocialTypeDetails({
        sectionId,
      })}
      vCenter={true}
    />
  );
}

function getSocialTypeDetails({ sectionId }) {
  return ({ children, id, details, checked }) => (
    <SocialTypeDetails
      id={id}
      sectionId={sectionId}
      details={details}
      checked={checked}
    >
      {children}
    </SocialTypeDetails>
  );
}

function SocialTypeDetails({
  children,
  id,
  sectionId,
  details,
  checked,
  name,
}) {
  return (
    <div className="mt-2 mb-2 w-full select-text">
      {details.map((k) => (
        <OneSocialDetails
          id={id}
          sectionId={sectionId}
          configName={k}
          label={children}
          key={`OutputDetails-${k}`}
        />
      ))}
    </div>
    // </Expandable>
  );
}

function OneSocialDetails({ id, sectionId, configName, label }) {
  const configValue = useSectionSocialConfig(
    (x) => x.x[sectionId]?.[id]?.[configName]
  );
  const setValueGlobal = useSectionSocialConfig((x) => x.setConfig);
  //   const [value, setValue] = useState(configValue);

  function onChange(value) {
    setValueGlobal({ sectionId, id, attr: configName, value });
  }

  return (
    <div className="flex w-full items-center gap-3">
      <p className="select-none text-sm font-bold">{label}</p>
      <input
        className=" w-full rounded-full bg-white px-4 py-1 text-sm ring-2 ring-slate-200 focus:ring-2 focus:ring-blue-500"
        value={configValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          id === "youtube"
            ? "https://www.youtube.com/"
            : "https://www.twitter.com/"
        }
      />
    </div>
  );
}
