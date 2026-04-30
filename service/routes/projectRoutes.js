'use strict';

const express = require('express');
const router  = express.Router();

const {
  readProjectsSnapshot,
  writeProjectsSnapshot,
  mergeProjectArtefacts,
} = require('../lib/resultStore');

// GET /api/projects — return current projects snapshot
router.get('/projects', (_req, res) => {
  try {
    const projects = readProjectsSnapshot();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/sync — receive a fresh snapshot exported from the portal
router.post('/projects/sync', (req, res) => {
  try {
    const projects = req.body;
    if (!Array.isArray(projects)) {
      return res.status(400).json({ error: 'Expected an array of projects' });
    }
    writeProjectsSnapshot(projects);
    res.json({ ok: true, count: projects.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/artefacts — merge diagram XML and other heavy artefacts for LLM tools (from portal export)
router.post('/projects/artefacts', (req, res) => {
  try {
    const raw = req.body;
    const items = Array.isArray(raw) ? raw : raw && raw.artefacts;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Expected { artefacts: [...] } or a raw array' });
    }
    const merged = mergeProjectArtefacts(items);
    res.json({ ok: true, projectCount: Object.keys(merged).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
