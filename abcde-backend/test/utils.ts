async function importLoadTestData() {
  return await import('abcde-frontend/src/__tests__utils/_loadTestData');
}

export async function loadOneProject(props) {
  const { loadOneProject: _loadOneProject } = await importLoadTestData();
  return await _loadOneProject({ forNode: true, ...props });
}

export async function loadAllProjects(props) {
  const { loadAllProjects: _loadAllProjects } = await importLoadTestData();
  return await _loadAllProjects({ forNode: true, ...props });
}

export async function loadSpecificTestData(props) {
  const { loadSpecificTestData: _loadTestData } = await importLoadTestData();
  return await _loadTestData({ forNode: true, ...props });
}
