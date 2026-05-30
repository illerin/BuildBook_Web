const BASE = process.env.REACT_APP_API_URL || '/api';

async function req(method, path, body, isForm = false) {
  const opts = { method, headers: {} };
  if (body && !isForm) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (isForm) opts.body = body;
  const response = await fetch(BASE + path, opts);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || response.statusText);
  }
  return response.json();
}

export const API_BASE = BASE.replace('/api', '');

export const api = {
  getCategories: () => req('GET', '/categories'),
  createCategory: (body) => req('POST', '/categories', body),
  updateCategory: (id, body) => req('PUT', `/categories/${id}`, body),
  reorderCategory: (id, direction) => req('PUT', `/categories/${id}/order`, { direction }),
  reorderCategories: (body) => req('PUT', '/categories/reorder/siblings', body),
  mergeCategory: (id, body) => req('POST', `/categories/${id}/merge`, body),
  deleteCategory: (id) => req('DELETE', `/categories/${id}`),
  uploadCategoryImage: (id, form) => req('POST', `/categories/${id}/image`, form, true),
  deleteCategoryImage: (id) => req('DELETE', `/categories/${id}/image`),

  globalSearch: (query) => req('GET', `/search?q=${encodeURIComponent(query || '')}`),

  getParts: (params) => {
    const cleanParams = Object.entries(params || {}).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== '') acc[key] = value;
      return acc;
    }, {});
    const query = new URLSearchParams(cleanParams).toString();
    return req('GET', `/parts${query ? `?${query}` : ''}`);
  },
  createPart: (body) => req('POST', '/parts', body),
  getPart: (id) => req('GET', `/parts/${id}`),
  updatePart: (id, body) => req('PUT', `/parts/${id}`, body),
  deletePart: (id) => req('DELETE', `/parts/${id}`),
  uploadPartImage: (id, form) => req('POST', `/parts/${id}/image`, form, true),
  // TODO(post-MVP): restore image lookup once product-page/search quality is reliable.
  findPartImage: (id) => req('POST', `/parts/${id}/find-image`),
  deletePartImage: (id) => req('DELETE', `/parts/${id}/image`),
  uploadPartDocument: (id, form) => req('POST', `/parts/${id}/documents`, form, true),
  setPrimaryPartDocument: (id) => req('PUT', `/part-documents/${id}/primary`),
  deletePartDocument: (id) => req('DELETE', `/part-documents/${id}`),
  // TODO(post-MVP): restore automatic spec import after improving extraction accuracy.
  scrapeSpecPreview: (url) => req('POST', '/scrape-spec', { url }),

  getProjects: () => req('GET', '/projects'),
  createProject: (body) => req('POST', '/projects', body),
  previewProjectImport: (form) => req('POST', '/projects/import/preview', form, true),
  commitProjectImport: (body) => req('POST', '/projects/import/commit', body),
  getProject: (id) => req('GET', `/projects/${id}`),
  updateProject: (id, body) => req('PUT', `/projects/${id}`, body),
  deleteProject: (id) => req('DELETE', `/projects/${id}`),
  downloadProjectExport: (id) => fetch(`${BASE}/projects/${id}/export`),
  uploadProjectImage: (id, form) => req('POST', `/projects/${id}/image`, form, true),
  deleteProjectImage: (id) => req('DELETE', `/projects/${id}/image`),
  uploadProjectNoteImage: (id, form) => req('POST', `/projects/${id}/note-images`, form, true),
  addProjectPart: (id, body) => req('POST', `/projects/${id}/parts`, body),
  updateProjectPart: (id, body) => req('PUT', `/project-parts/${id}`, body),
  removeProjectPart: (id) => req('DELETE', `/project-parts/${id}`),
  uploadProjectFile: (id, form) => req('POST', `/projects/${id}/files`, form, true),
  downloadProjectFileUrl: (id) => `${BASE}/project-files/${id}/download`,
  deleteProjectFile: (id) => req('DELETE', `/project-files/${id}`),
  toggleFileLatest: (id, is_latest) => req('PUT', `/project-files/${id}/latest`, { is_latest }),
  addChecklist: (id, body) => req('POST', `/projects/${id}/checklist`, body),
  updateChecklist: (id, body) => req('PUT', `/checklist/${id}`, body),
  deleteChecklist: (id) => req('DELETE', `/checklist/${id}`),
  getStepDefinitions: () => req('GET', '/step-definitions'),
  addProjectStep: (id, body) => req('POST', `/projects/${id}/steps`, body),
  removeProjectStep: (projectId, stepId) => req('DELETE', `/projects/${projectId}/steps/${stepId}`),
  getProjectTemplate: () => req('GET', '/settings/project-template'),
  updateProjectTemplate: (body) => req('PUT', '/settings/project-template', body),
  getTheme: () => req('GET', '/settings/theme'),
  updateTheme: (body) => req('PUT', '/settings/theme', body),
  getStorageLocations: () => req('GET', '/settings/storage-locations'),
  updateStorageLocations: (storage_locations) => req('PUT', '/settings/storage-locations', { storage_locations }),
  scanStorageCleanup: () => req('GET', '/settings/storage-cleanup/scan'),
  deleteStorageCleanup: (body) => req('POST', '/settings/storage-cleanup/delete', body),
  resetDefaults: () => req('POST', '/settings/reset-defaults'),

  getImports: () => req('GET', '/imports'),
  uploadImportCsv: (form) => req('POST', '/imports/upload', form, true),
  uploadDigiKeyPdf: (form) => req('POST', '/imports/digikey-pdf', form, true),
  getImport: (id) => req('GET', `/imports/${id}`),
  // TODO(post-MVP): restore import image lookup once search/result validation is reliable.
  findImportItemImage: (id) => req('POST', `/import-items/${id}/find-image`),
  findMissingImportImages: (id = 'all') => req('POST', `/imports/${id}/find-missing-images`),
  promoteImportItem: (id, body) => req('POST', `/import-items/${id}/promote`, body),
  mergeImportItem: (id, body) => req('POST', `/import-items/${id}/merge`, body),
  skipImportItem: (id) => req('POST', `/import-items/${id}/skip`),
  backfillImportImages: (id = 'all') => req('POST', `/imports/${id}/backfill-images`),
  deleteImport: (id) => req('DELETE', `/imports/${id}`),

  downloadBackup: () => fetch(`${BASE}/settings/backup`),
  restoreBackup: (form) => req('POST', '/settings/restore', form, true),
};
