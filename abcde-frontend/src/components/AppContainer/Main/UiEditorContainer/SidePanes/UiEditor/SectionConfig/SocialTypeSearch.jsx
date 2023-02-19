import * as Collapsible from "@radix-ui/react-collapsible";
import { useGetSectionTypeConfig } from "hooks/useSectionType";
import {
  SOCIAL_TYPES,
  useSectionSocialConfig,
} from "models/info/sectionSocialConfig";
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

function SocialTypeDetails({ children, id, sectionId, details, checked }) {
  return (
    <Collapsible.Root open={checked}>
      <Collapsible.Trigger asChild>{children}</Collapsible.Trigger>
      <Collapsible.Content>
        <div className="mt-2 select-text rounded-md bg-slate-200 py-3 px-5">
          {details.map((k) => (
            <OneSocialDetails
              id={id}
              sectionId={sectionId}
              configName={k}
              key={`OutputDetails-${k}`}
            />
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function OneSocialDetails({ id, sectionId, configName }) {
  const configValue = useSectionSocialConfig(
    (x) => x.x[sectionId]?.[id]?.[configName]
  );
  const setValueGlobal = useSectionSocialConfig((x) => x.setConfig);
  //   const [value, setValue] = useState(configValue);

  function onChange(value) {
    setValueGlobal({ sectionId, id, attr: configName, value });
  }

  return (
    <div className="flex items-center gap-3">
      <h3 className="text-sm font-bold text-slate-500">{configName}</h3>
      <input
        className=" w-full rounded-full bg-white px-4 py-1 text-sm focus:ring-1 focus:ring-blue-500"
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
