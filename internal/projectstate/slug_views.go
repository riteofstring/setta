package projectstate

import "sort"

func ActiveSectionSlugMaps(
	project Project,
) (map[string]string, map[string][]string, error) {
	return activeSectionSlugMap(project, nil)
}

func WindowSpaceSlugMaps(
	windowSpaces map[string]WindowSpaceConfig,
) (map[string]string, map[string][]string) {
	slugByWindowSpaceID := make(map[string]string, len(windowSpaces))
	windowSpaceIDsBySlug := map[string][]string{}

	orderedWindowSpaceIDs := make([]string, 0, len(windowSpaces))
	for windowSpaceID := range windowSpaces {
		orderedWindowSpaceIDs = append(orderedWindowSpaceIDs, windowSpaceID)
	}
	sort.Strings(orderedWindowSpaceIDs)

	for _, windowSpaceID := range orderedWindowSpaceIDs {
		windowSpace := windowSpaces[windowSpaceID]
		slug := sanitizeProjectSlug(windowSpace.Name)
		slugByWindowSpaceID[windowSpaceID] = slug
		windowSpaceIDsBySlug[slug] = append(
			windowSpaceIDsBySlug[slug],
			windowSpaceID,
		)
	}

	return slugByWindowSpaceID, windowSpaceIDsBySlug
}
