const BASE = process.env.REACT_APP_API_URL || '/api';

async function req(method, path, body, isForm = false) {
 const opts = { method, headers: {} };
 if (body && !isForm) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
 if (isForm) opts.body = body;
 const r = await fetch(BASE + path, opts);
 if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error || r.statusText); }
 return r.json();
}

export const api = {
 // Categories (part_group with parent_id)
 getCategories: () => req('GET', '/categories'),
 getCategoriesFlat: () => req('GET', '/categories/flat'),
 getCategory: id => req('GET', `/categories/${id}`),
 createCategory: b => req('POST', '/categories', b),
 updateCategory: (id, b) => req('PUT', `/categories/${id}`, b),
 deleteCategory: id => req('DELETE', `/categories/${id}`),
 uploadCategoryImage: (id, form) => req('POST', `/categories/${id}/image`, form, true),
 deleteCategoryImage: id => req('DELETE', `/categories/${id}/image`),

 // Part groups (aliases)
 getGroups: () => req('GET', '/part-groups'),
 getGroup: id => req('GET', `/part-groups/${id}`),
 updateGroup: (id, b) => req('PUT', `/part-groups/${id}`, b),
 deleteGroup: id => req('DELETE', `/part-groups/${id}`),
 uploadGroupImage: (id, form) => req('POST', `/categories/${id}/image`, form, true),
 deleteGroupImage: id => req('DELETE', `/categories/${id}/image`),

 // Variants
 getVariants: params => {
 const q = new URLSearchParams(params || {}).toString();
 return req('GET', '/variants' + (q ? '?' + q : ''));
 },
 getGroupVariants: gid => req('GET', `/part-groups/${gid}/variants`),
 createVariant: (gid, b) => req('POST', `/part-groups/${gid}/variants`, b),
 getVariant: id => req('GET', `/variants/${id}`),
 updateVariant: (id, b) => req('PUT', `/variants/${id}`, b),
 deleteVariant: id => req('DELETE', `/variants/${id}`),
 getAdjustments: id => req('GET', `/variants/${id}/adjustments`),
 uploadVariantImage: (id, form) => req('POST', `/variants/${id}/image`, form, true),
 deleteVariantImage: id => req('DELETE', `/variants/${id}/image`),
 scrapeSpec: (id, url) => req('POST', `/variants/${id}/scrape-spec`, { url }),
 scrapeSpecPreview: url => req('POST', `/scrape-spec`, { url }),

 // Documents
 uploadDocument: (vid, form) => req('POST', `/variants/${vid}/documents`, form, true),
 deleteDocument: id => req('DELETE', `/documents/${id}`),

 // Orders
 getOrders: (sort) => req('GET', `/orders${sort ? `?sort=${sort}` : ''}`),
 getOrder: id => req('GET', `/orders/${id}`),
 importCsv: form => req('POST', '/orders/import-csv', form, true),
 confirmImport: body => req('POST', '/orders/confirm-import', body),
 mapOrderItem: (id, b) => req('PUT', `/order-items/${id}/map`, b),
 receiveOrder: id => req('POST', `/orders/${id}/receive`),
 deleteOrder: id => req('DELETE', `/orders/${id}`),

 // Projects
 getProjects: () => req('GET', '/projects'),
 getProject: id => req('GET', `/projects/${id}`),
 createProject: b => req('POST', '/projects', b),
 updateProject: (id, b) => req('PUT', `/projects/${id}`, b),
 deleteProject: id => req('DELETE', `/projects/${id}`),
 addProjectPart: (id, b) => req('POST', `/projects/${id}/parts`, b),
 removeProjectPart: id => req('DELETE', `/project-parts/${id}`),
 uploadProjectFile: (id, form) => req('POST', `/projects/${id}/files`, form, true),
 deleteProjectFile: id => req('DELETE', `/project-files/${id}`),
 toggleFileLatest: (id, is_latest) => req('PUT', `/project-files/${id}/latest`, { is_latest }),
 uploadProjectImage: (id, form) => req('POST', `/projects/${id}/image`, form, true),
 deleteProjectImage: id => req('DELETE', `/projects/${id}/image`),
 addChecklist: (id, b) => req('POST', `/projects/${id}/checklist`, b),
 updateChecklist: (id, b) => req('PUT', `/checklist/${id}`, b),
 deleteChecklist: id => req('DELETE', `/checklist/${id}`),
 addProjectStep: (id, b) => req('POST', `/projects/${id}/steps`, b),
 removeProjectStep: (pid, sid) => req('DELETE', `/projects/${pid}/steps/${sid}`),

 // Steps
 getStepDefs: () => req('GET', '/step-definitions'),
 createStepDef: b => req('POST', '/step-definitions', b),

 // Settings
 exportInventory: () => fetch((process.env.REACT_APP_API_URL||'/api') + '/settings/export-inventory'),
 importInventory: form => req('POST', '/settings/import-inventory', form, true),
 importTemplate: form => req('POST', '/settings/import-template', form, true),
 downloadBackup: () => fetch((process.env.REACT_APP_API_URL||'/api') + '/settings/backup'),
 restoreBackup: form => req('POST', '/settings/restore', form, true),
};
