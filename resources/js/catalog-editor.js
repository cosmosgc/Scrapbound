import { catalogToolbar, bindCatalogToolbar } from './workshop-tools.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const label = value => String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, character => character.toUpperCase());
const pathAttribute = path => escapeHtml(JSON.stringify(path));

export const TECHNOLOGY_EFFECTS = [
  { id: 'unlockResources', kind: 'list', label: 'Unlock resources', description: 'Make a resource available to the player.' },
  { id: 'unlockZones', kind: 'list', label: 'Unlock zones', description: 'Open a new world zone.' },
  { id: 'unlockCapabilities', kind: 'list', label: 'Unlock capabilities', description: 'Enable a future gameplay capability.' },
  { id: 'unlockPrograms', kind: 'list', label: 'Unlock programs', description: 'Unlock a bot program or behavior.' },
  { id: 'unlockModules', kind: 'list', label: 'Unlock modules', description: 'Unlock a robot module.' },
  { id: 'unlockBotKinds', kind: 'list', label: 'Unlock bot kinds', description: 'Unlock a robot type.' },
  { id: 'sceneUnlocks', kind: 'list', label: 'Scene unlocks', description: 'Unlock a buildable scene object.' },
  { id: 'spawnWeightMultipliers', kind: 'map', label: 'Spawn weight multipliers', description: 'Adjust how often a resource appears.' },
  { id: 'deliveryValueMultipliers', kind: 'map', label: 'Delivery value multipliers', description: 'Adjust resource delivery value.' },
  { id: 'stockMultipliers', kind: 'map', label: 'Stock multipliers', description: 'Adjust resource site stock.' },
  { id: 'respawnTimeMultipliers', kind: 'map', label: 'Respawn time multipliers', description: 'Adjust resource restock time.' },
  { id: 'offlineSecondsBonus', kind: 'number', label: 'Offline time bonus', description: 'Add bounded server-side offline catch-up time in seconds.' },
];

function renderEffects(value, path) {
  const choices = TECHNOLOGY_EFFECTS.filter(effect => !Object.hasOwn(value, effect.id));
  const picker = `<div class="effect-picker"><label class="structured-field"><span>${choices.length ? 'Choose a gameplay effect to add' : 'All supported effects are configured'}</span><select data-effect-choice data-effect-path="${pathAttribute(path)}" ${choices.length ? '' : 'disabled'}><option value="">Select an effect…</option>${choices.map(effect => `<option value="${escapeHtml(effect.id)}">${escapeHtml(effect.label)} · ${escapeHtml(effect.id)}</option>`).join('')}</select></label></div>${Object.entries(value).map(([effectKey, effectValue]) => {
    const definition = TECHNOLOGY_EFFECTS.find(effect => effect.id === effectKey);
    if (!definition) return `<div class="effect-config"><b>${escapeHtml(label(effectKey))}</b><span class="effect-warning">Unsupported effect — remove it or use Advanced JSON.</span><button type="button" class="text-action danger" data-editor-op="remove-effect" data-editor-path="${pathAttribute([...path, effectKey])}">Remove</button></div>`;
    return `<div class="effect-config"><div class="effect-config-heading"><div><b>${escapeHtml(definition.label)}</b><small>${escapeHtml(definition.description)}</small></div><button type="button" class="text-action danger" data-editor-op="remove-effect" data-editor-path="${pathAttribute([...path, effectKey])}">Remove</button></div>${definition.kind === 'list'
      ? `<label class="structured-field"><span>IDs · comma separated</span><input type="text" data-editor-path="${pathAttribute([...path, effectKey])}" data-editor-type="list" value="${escapeHtml(effectValue.join(', '))}" placeholder="e.g. ${effectKey === 'unlockCapabilities' ? 'remote_drone_ops' : 'new_content_id'}"></label>`
      : definition.kind === 'number'
        ? `<label class="structured-field"><span>Additional seconds · maximum 14400</span><input type="number" min="0" max="14400" step="1" data-editor-path="${pathAttribute([...path, effectKey])}" data-editor-type="number" value="${escapeHtml(effectValue)}"></label>`
      : `<div class="effect-map-list">${Object.entries(effectValue).map(([resourceId, multiplier]) => `<div class="effect-map-row"><label class="structured-field"><span>Resource ID</span><input type="text" data-editor-path="${pathAttribute([...path, effectKey, resourceId, '__resourceKey'])}" data-editor-type="map-key" value="${escapeHtml(resourceId)}" placeholder="alloy"></label><label class="structured-field"><span>Multiplier</span><input type="number" min="${effectKey === 'respawnTimeMultipliers' ? '.1' : '0'}" max="5" step="any" data-editor-path="${pathAttribute([...path, effectKey, resourceId])}" data-editor-type="number" value="${escapeHtml(multiplier)}"></label><button type="button" class="text-action danger" data-editor-op="remove-effect-map-entry" data-editor-path="${pathAttribute([...path, effectKey, resourceId])}">Remove</button></div>`).join('')}<button type="button" class="text-action" data-editor-op="add-effect-map-entry" data-editor-path="${pathAttribute([...path, effectKey])}">＋ Add resource multiplier</button></div>`}</div>`;
  }).join('')}`;
  return `<fieldset class="structured-object technology-effects"><legend>Gameplay effects</legend>${picker}<div class="effect-config-list">${Object.keys(value).length ? '' : '<div class="effect-empty">No effects configured. Search or choose an effect above to add one.</div>'}</div></fieldset>`;
}

function cardTitle(value, index) {
  return value?.name || value?.id || `Entry ${index + 1}`;
}

function renderValue(value, key, path, rootContent, parentArray = false, index = 0) {
  const pathAttr = pathAttribute(path);
  const title = label(key);
  if (key === 'prerequisites' && path[0] === 'technologyNodes') {
    const nodeIndex = path[1];
    const nodes = rootContent.technologyNodes || [];
    const selected = new Set(value);
    const available = nodes.filter((node, index) => index !== nodeIndex && !selected.has(node.id));
    return `<div class="prerequisite-picker"><div class="prerequisite-picker-heading"><b>Prerequisites</b><small>Choose the technologies that must be researched first.</small></div><div class="prerequisite-selected">${value.length ? value.map((id, index) => {
      const node = nodes.find(entry => entry.id === id);
      return `<span class="prerequisite-chip">${escapeHtml(node?.name || id)}<button type="button" aria-label="Remove prerequisite ${escapeHtml(node?.name || id)}" data-editor-op="remove-prerequisite" data-editor-path="${pathAttribute([...path, index])}">×</button></span>`;
    }).join('') : '<span class="effect-empty">No prerequisites — available from the start.</span>'}</div><div class="prerequisite-select"><label class="structured-field"><span>${available.length ? 'Choose a prerequisite to add' : 'No more prerequisites available'}</span><select data-prerequisite-choice data-prerequisite-path="${pathAttr}" ${available.length ? '' : 'disabled'}><option value="">Select a technology…</option>${available.map(node => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.name)} · ${escapeHtml(node.id)}</option>`).join('')}</select></label></div></div>`;
  }
  if (Array.isArray(value)) {
    if (value.length && value.every(entry => entry && typeof entry === 'object' && !Array.isArray(entry))) {
      return `<div class="structured-field structured-array"><div class="structured-array-heading"><b>${escapeHtml(title)}</b><button type="button" class="text-action" data-editor-op="add" data-editor-path="${pathAttr}">＋ Add ${escapeHtml(key.endsWith('s') ? key.slice(0, -1) : key)}</button></div><div class="structured-array-list">${value.map((entry, entryIndex) => `<details class="structured-entry"><summary><b>${escapeHtml(cardTitle(entry, entryIndex))}</b><span>ENTRY ${entryIndex + 1}</span></summary><div class="structured-entry-body">${Object.entries(entry).map(([childKey, childValue]) => renderValue(childValue, childKey, [...path, entryIndex, childKey], rootContent)).join('')}<div class="structured-entry-actions"><button type="button" class="text-action" data-editor-op="up" data-editor-path="${pathAttribute([...path, entryIndex])}" ${entryIndex === 0 ? 'disabled' : ''}>↑ Move up</button><button type="button" class="text-action" data-editor-op="down" data-editor-path="${pathAttribute([...path, entryIndex])}" ${entryIndex === value.length - 1 ? 'disabled' : ''}>↓ Move down</button><button type="button" class="text-action danger" data-editor-op="remove" data-editor-path="${pathAttribute([...path, entryIndex])}">Remove</button></div></div></details>`).join('')}</div></div>`;
    }
    const numeric = value.length > 0 && value.every(entry => typeof entry === 'number');
    return `<label class="structured-field"><span>${escapeHtml(title)}</span><input type="text" data-editor-path="${pathAttr}" data-editor-type="list${numeric ? '-number' : ''}" value="${escapeHtml(value.join(', '))}" placeholder="Comma-separated values"></label>`;
  }
  if (value && typeof value === 'object') {
    if (key === 'effects' && path[0] === 'technologyNodes') return renderEffects(value, path);
    return `<fieldset class="structured-object"><legend>${escapeHtml(title)}</legend>${Object.entries(value).map(([childKey, childValue]) => renderValue(childValue, childKey, [...path, childKey], rootContent)).join('')}</fieldset>`;
  }
  if (typeof value === 'boolean') {
    return `<label class="structured-field structured-checkbox"><input type="checkbox" data-editor-path="${pathAttr}" data-editor-type="boolean" ${value ? 'checked' : ''}><span>${escapeHtml(title)}</span></label>`;
  }
  if (typeof value === 'number') {
    return `<label class="structured-field"><span>${escapeHtml(title)}</span><input type="number" step="any" data-editor-path="${pathAttr}" data-editor-type="number" value="${escapeHtml(value)}"></label>`;
  }
  const useTextarea = /description|summary|message/i.test(key);
  return `<label class="structured-field ${useTextarea ? 'structured-wide' : ''}"><span>${escapeHtml(title)}</span>${useTextarea ? `<textarea rows="3" data-editor-path="${pathAttr}" data-editor-type="string">${escapeHtml(value)}</textarea>` : `<input type="text" data-editor-path="${pathAttr}" data-editor-type="string" value="${escapeHtml(value)}">`}</label>`;
}

export function renderCatalogEditor(host, content, onlySection = null) {
  if (!host) return;
  const sections = onlySection ? [onlySection] : Object.keys(content);
  const openEntries = new Set([...(host.querySelectorAll?.('.structured-entry[open]') || [])].map(entry => entry.querySelector('input[data-editor-path]')?.value));
  const search = host.querySelector?.('[data-studio-search]')?.value || '';
  host.innerHTML = `${catalogToolbar(content, onlySection)}<div class="studio-sections">${sections.filter(key => Object.hasOwn(content, key)).map(key => {
    const value = content[key];
    const count = Array.isArray(value) ? ` · ${value.length} entries` : '';
    return `<details class="structured-section" open data-editor-section="${escapeHtml(key)}"><summary><strong>${escapeHtml(label(key))}</strong><span>${escapeHtml(key)}${count}</span></summary><div class="structured-section-body">${renderValue(value, key, [key], content)}${Array.isArray(value) && (!value.length || !value.every(entry => entry && typeof entry === 'object' && !Array.isArray(entry))) ? `<button type="button" class="button button-secondary" data-editor-op="add" data-editor-path="${pathAttribute([key])}">＋ Add ${escapeHtml(label(key).replace(/s$/, ''))}</button>` : ''}</div></details>`;
  }).join('')}</div>`;
  bindCatalogToolbar(host);
  host.querySelectorAll?.('.structured-entry').forEach(entry => { entry.open = openEntries.has(entry.querySelector('input[data-editor-path]')?.value); });
  const searchInput = host.querySelector?.('[data-studio-search]');
  if (searchInput && search) { searchInput.value = search; searchInput.dispatchEvent(new Event('input')); }
}

export function catalogEntryTemplate(path, content) {
  const section = path[0];
  const sample = content[section]?.[0];
  if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
    const clone = JSON.parse(JSON.stringify(sample));
    const key = section === 'technologyNodes' ? 'id' : 'id';
    const stem = section === 'technologyNodes' ? 'new_technology' : `new_${section.replace(/s$/, '')}`;
    let suffix = (content[section]?.length || 0) + 1;
    while (content[section]?.some(entry => entry?.[key] === `${stem}_${suffix}`)) suffix++;
    clone[key] = `${stem}_${suffix}`;
    if (section === 'technologyNodes') { clone.name = 'New technology'; clone.description = ''; clone.prerequisites = []; clone.effects = {}; delete clone.gridPosition; }
    return clone;
  }
  if (section === 'technologyNodes') return { id: 'new_technology', name: 'New technology', description: '', cost: 0, currency: 'credits', prerequisites: [], effects: {} };
  return {};
}

export function setCatalogPath(content, path, value) {
  let target = content;
  for (const key of path.slice(0, -1)) target = target[key];
  target[path.at(-1)] = value;
}

export function mutateCatalogArray(content, path, operation) {
  const target = path.reduce((value, key) => value[key], content);
  if (operation === 'add') {
    if (Array.isArray(target)) target.push(catalogEntryTemplate(path, content));
    return;
  }
  const index = Number(path.at(-1));
  const array = path.slice(0, -1).reduce((value, key) => value[key], content);
  if (!Array.isArray(array)) return;
  if (operation === 'remove') array.splice(index, 1);
  if (operation === 'up' && index > 0) [array[index - 1], array[index]] = [array[index], array[index - 1]];
  if (operation === 'down' && index < array.length - 1) [array[index + 1], array[index]] = [array[index], array[index + 1]];
}

export function mutateTechnologyEffect(content, path, operation, effectKey = '') {
  const target = path.reduce((value, key) => value[key], content);
  if (operation === 'add-effect') {
    const definition = TECHNOLOGY_EFFECTS.find(effect => effect.id === effectKey);
    if (!definition || Object.hasOwn(target, effectKey)) return false;
    target[effectKey] = definition.kind === 'list' ? [] : definition.kind === 'number' ? 0 : {};
    return true;
  } else if (operation === 'remove-effect') {
    const effectKey = path.at(-1);
    const effects = path.slice(0, -1).reduce((value, key) => value[key], content);
    delete effects[effectKey];
  } else if (operation === 'add-effect-map-entry') {
    let key = 'resource_id';
    let suffix = 2;
    while (Object.hasOwn(target, key)) key = `resource_id_${suffix++}`;
    target[key] = 1;
  } else if (operation === 'remove-effect-map-entry') {
    const map = path.slice(0, -1).reduce((value, key) => value[key], content);
    delete map[path.at(-1)];
  }
}

export function renameEffectMapKey(content, path, key) {
  const map = path.slice(0, -2).reduce((value, segment) => value[segment], content);
  const previousKey = path.at(-2);
  if (!key || (key !== previousKey && Object.hasOwn(map, key))) return false;
  map[key] = map[previousKey];
  if (key !== previousKey) delete map[previousKey];
  return true;
}

export function addTechnologyPrerequisite(content, path, prerequisiteId) {
  const nodeIndex = path[1];
  const prerequisites = path.reduce((value, key) => value[key], content);
  const allowed = content.technologyNodes?.filter((_, index) => index !== nodeIndex).some(node => node.id === prerequisiteId);
  if (!allowed || prerequisites.includes(prerequisiteId)) return false;
  prerequisites.push(prerequisiteId);
  return true;
}
