import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogToolbar } from '../resources/js/workshop-tools.js';

test('catalog toolbar generates safe section links and accurate counts', () => {
  const toolbar = catalogToolbar({ resources: [{id:'scrap'}], technologyNodes: [{id:'survey'}] });
  assert.match(toolbar, /2 entries · 2 sections/);
  assert.match(toolbar, /data-studio-section="technologyNodes"/);
  assert.match(toolbar, /data-studio-search/);
  assert.match(catalogToolbar({'<script>': []}), /&lt;script&gt;/);
});
