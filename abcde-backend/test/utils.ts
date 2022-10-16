async function importLoadTestData() {
  return await import('abcde-frontend/src/__tests__utils/_loadTestData');
}

export async function loadTestData() {
  const { loadTestData: _loadTestData } = await importLoadTestData();
  return await _loadTestData();
}

export async function loadSpecificTestData(props) {
  const { loadSpecificTestData: _loadTestData } = await importLoadTestData();
  return (await _loadTestData(props)).default; //have to access default again here for some reason
}
