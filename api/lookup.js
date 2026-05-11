// api/lookup.js

module.exports = async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const batchId      = req.query.batchId;
  const token        = process.env.WEBFLOW_API_TOKEN;
  const collectionId = process.env.WEBFLOW_COLLECTION_ID;

  if (!batchId) return res.status(400).json({ error: 'Provide a batchId in the URL.' });
  if (!token)   return res.status(500).json({ error: 'Missing WEBFLOW_API_TOKEN in Vercel settings.' });
  if (!collectionId) return res.status(500).json({ error: 'Missing WEBFLOW_COLLECTION_ID in Vercel settings.' });

  const HEADERS = {
    'Authorization': `Bearer ${token}`,
    'accept-version': '2.0.0',
  };

  try {

    // ── Step 1: Fetch the collection SCHEMA ──────────────────────────────
    // This gives us the option labels for the Kiln Type dropdown,
    // and the Artisans collection ID from the Reference field.
    const schemaRes = await fetch(
      `https://api.webflow.com/v2/collections/${collectionId}`,
      { headers: HEADERS }
    );
    const schema = schemaRes.ok ? await schemaRes.json() : null;

    // Build a map of { optionId → optionLabel } for kiln-type
    const kilnTypeMap = {};
    let artisansCollectionId = null;

    if (schema && schema.fields) {
      schema.fields.forEach(field => {

        // Resolve kiln-type option IDs → human labels
        if (field.slug === 'kiln-type' && field.validations?.options) {
          field.validations.options.forEach(opt => {
            kilnTypeMap[opt.id] = opt.name;
          });
        }

        // Discover artisans collection ID from the Reference field
        if (field.slug === 'artisan' && field.validations?.collectionId) {
          artisansCollectionId = field.validations.collectionId;
        }

      });
    }

    // ── Step 2: Fetch all batch items ────────────────────────────────────
    const batchRes = await fetch(
      `https://api.webflow.com/v2/collections/${collectionId}/items?limit=100`,
      { headers: HEADERS }
    );

    if (!batchRes.ok) {
      const body = await batchRes.text();
      return res.status(batchRes.status).json({
        error: `Webflow error ${batchRes.status}`,
        detail: body,
        hint:
          batchRes.status === 401 ? 'API token is wrong.' :
          batchRes.status === 403 ? 'Free Webflow plan blocks API. Upgrade to Basic.' :
          batchRes.status === 404 ? 'Collection ID is wrong.' : ''
      });
    }

    const batchData = await batchRes.json();
    const items = batchData.items || [];

    // ── Step 3: Find the matching batch ──────────────────────────────────
    const match = items.find(item =>
      (item.fieldData['batch-id'] || '').toLowerCase() === batchId.toLowerCase()
    );

    if (!match) {
      return res.status(404).json({
        error: `No batch found for "${batchId}"`,
        available: items.map(i => i.fieldData['batch-id']).filter(Boolean)
      });
    }

    const fieldData = match.fieldData;

    // ── Step 4: Resolve kiln-type ID → label ─────────────────────────────
    const kilnTypeRaw = fieldData['kiln-type'] || '';
    const kilnTypeLabel = kilnTypeMap[kilnTypeRaw] || kilnTypeRaw;

    // ── Step 5: Strip HTML tags from Rich Text fields ─────────────────────
    const stripHtml = (html) => (html || '').replace(/<[^>]*>/g, '').trim();

    // ── Step 6: Fetch artisan details if we have the collection ID ────────
    let artisan = null;
    const artisanItemId = fieldData['artisan'];

    if (artisanItemId && artisansCollectionId) {
      const artisanRes = await fetch(
        `https://api.webflow.com/v2/collections/${artisansCollectionId}/items/${artisanItemId}`,
        { headers: HEADERS }
      );
      if (artisanRes.ok) {
        const artisanJson = await artisanRes.json();
        artisan = artisanJson.fieldData || null;
      }
    }

    // ── Step 7: Return clean, human-readable data ─────────────────────────
    return res.status(200).json({
      'batch-id':          fieldData['batch-id'],
      'name':              fieldData['name'],
      'kiln-type':         kilnTypeLabel,
      'peak-temperature':  fieldData['peak-temperature'],
      'clay-composition':  stripHtml(fieldData['clay-composition']),
      'artisan-notes':     fieldData['artisan-notes'],
      'firing-date':       fieldData['firing-date'],
      'artisan':           artisan,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

};
