'use strict';

const express = require('express');
const router  = express.Router();

const {
  readProjectsSnapshot,
  writeProjectsSnapshot,
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

module.exports = router;
