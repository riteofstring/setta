async function importLoadTestData() {
  return await import('abcde-frontend/src/__tests__utils/_loadTestData');
}

export async function loadAllProjects() {
  const { loadAllProjects: _loadAllProjects } = await importLoadTestData();
  return await _loadAllProjects({ forBackend: true });
}

export async function loadSpecificTestData(props) {
  const { loadSpecificTestData: _loadTestData } = await importLoadTestData();
  return await _loadTestData({ forBackend: true, ...props });
}
