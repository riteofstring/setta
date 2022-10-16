export async function loadTestData() {
  const { loadTestData: _loadTestData } = await import(
    'abcde-frontend/src/__tests__utils/_loadTestData'
  );
  return await _loadTestData();
}
