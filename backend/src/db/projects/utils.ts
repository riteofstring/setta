export function convertToFileMenuFormat({ projects, projectId }) {
  const data = [];
  for (const p of projects) {
    if (!projectId) {
      data.push({ ...p, selectable: false, depth: 0 });
      for (const c of p.configs) {
        data.push({ ...c, projectName: p.name, selectable: true, depth: 1 });
      }
    } else if (projectId === p.id) {
      for (const c of p.configs) {
        data.push({ ...c, projectName: p.name, selectable: true, depth: 0 });
      }
    }
  }
  return data;
}
