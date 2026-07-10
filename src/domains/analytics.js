const motor = require('../core/motor');
const db = require('../core/db');
const { EngineError } = require('../core/errors');

class AnalyticsDomain {
  static domain = 'ANALYTICS';

  static schemas = {
    'track-visit': {
      type: 'object',
      properties: {
        visit_data: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            url: { type: 'string' },
            referrer: { type: 'string' },
            userAgent: { type: 'string' },
            language: { type: 'string' },
            requestId: { type: 'string' },
          },
        },
        network_data: {
          type: 'object',
          properties: {
            ip: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        tenantId: { type: 'string' },
      },
      required: [],
    },
    'list-visits': {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'Tenant identifier to filter visits' },
        visit_type: { type: 'string', description: 'Filter by visit type (e.g., page_view)' },
        limit: { type: 'integer', default: 50 },
        offset: { type: 'integer', default: 0 },
      },
      required: ['tenantId'],
    },
  };

  static docs = {
    'track-visit': {
      description:
        'Registers a web visit. Automatically enriches the data with GeoIP (Country, City, ISP) and normalizes the User Agent into Browser, OS, and Device Type.',
      errors: ['DB_ERROR', 'INVALID_PAYLOAD'],
    },
    'list-visits': {
      description:
        'Retrieves a list of tracked visits for a specific tenant, including a summary of total visits, unique visitors, and unique countries.',
      errors: ['DB_ERROR', 'INVALID_PAYLOAD'],
    },
  };

  static commands = {
    'track-visit': async function (user, payload) {
      // 1. Data Fabrication (The "Shield" logic)
      const { visit_data = {}, network_data = {}, tenantId = '1', _request = {} } = payload;

      const finalPayload = {
        tenantId: tenantId,
        visit_data: {
          type: visit_data.type || 'page_view',
          url: visit_data.url || 'unknown_url',
          userAgent: visit_data.userAgent || _request.userAgent || 'unknown_agent',
          referrer: visit_data.referrer || 'direct',
          language: visit_data.language || 'unknown',
          requestId: visit_data.requestId || `req-${Math.random().toString(36).substr(2, 9)}`,
        },
        network_data: {
          ip: network_data.ip || _request.ip || '0.0.0.0',
          timestamp: network_data.timestamp || new Date().toISOString(),
        },
      };

      const ip = finalPayload.network_data.ip;

      // 2. GeoIP Enrichment
      let geo = { country: 'Unknown', city: 'Unknown', isp: 'Unknown' };
      try {
        const geoRes = await db.query(
          'SELECT country, city, isp FROM geoip_data WHERE $1 >= ip_start AND $1 <= ip_end LIMIT 1',
          [ip]
        );
        if (geoRes.rows.length > 0) {
          geo = geoRes.rows[0];
        }
      } catch (e) {
        console.error('GeoIP lookup error:', e);
      }

      // 3. Device Normalization
      const ua = finalPayload.visit_data.userAgent;
      const device = normalizeUserAgent(ua);

      // 4. Storage
      try {
        const result = await db.query(
          `INSERT INTO logs_trafico (
            tenant_id, visit_type, url, referrer, user_agent, language,
            request_id, ip_address, timestamp, country, city, isp,
            browser, os, device_type
          )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING id`,
          [
            parseInt(finalPayload.tenantId, 10) || 1,
            finalPayload.visit_data.type,
            finalPayload.visit_data.url,
            finalPayload.visit_data.referrer,
            finalPayload.visit_data.userAgent,
            finalPayload.visit_data.language,
            finalPayload.visit_data.requestId,
            finalPayload.network_data.ip,
            finalPayload.network_data.timestamp,
            geo.country,
            geo.city,
            geo.isp,
            device.browser,
            device.os,
            device.deviceType,
          ]
        );

        return {
          status: 'success',
          message: 'Visit tracked and enriched successfully',
          data: { log_id: result.rows[0].id },
        };
      } catch (e) {
        console.error('Database error in track-visit:', e);
        throw new EngineError('DB_ERROR', {
          message: 'Failed to store traffic log in database',
          solution: 'Check database connectivity and table permissions.',
        });
      }
    },

    'list-visits': async function (user, payload) {
      const { tenantId, visit_type, limit = 50, offset = 0 } = payload;
      const tid = parseInt(tenantId, 10) || 1;

      let query = 'SELECT * FROM logs_trafico WHERE tenant_id = $1';
      const params = [tid];
      let paramIdx = 2;

      if (visit_type) {
        query += ` AND visit_type = $${paramIdx++}`;
        params.push(visit_type);
      }

      query += ` ORDER BY timestamp DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      params.push(limit, offset);

      const visits = await db.query(query, params);

      // Basic Aggregation
      try {
        const statsQuery = `
          SELECT
            count(*) as total,
            count(DISTINCT ip_address) as unique_visitors,
            count(DISTINCT country) as unique_countries
          FROM logs_trafico
          WHERE tenant_id = $1
        `;
        const stats = await db.query(statsQuery, [tid]);

        return {
          status: 'success',
          data: {
            visits: visits.rows,
            summary: stats.rows[0],
          },
        };
      } catch (e) {
        console.error('Database error in list-visits stats:', e);
        throw new EngineError('DB_ERROR', {
          message: 'Failed to retrieve traffic statistics',
          solution: 'Check if the logs_trafico table is accessible.',
        });
      }
    },
  };
}

function normalizeUserAgent(ua) {
  let os = 'Unknown';
  let browser = 'Unknown';
  let deviceType = 'Desktop';

  if (/windows/i.test(ua)) os = 'Windows';
  else if (/android/i.test(ua)) {
    os = 'Android';
    deviceType = 'Mobile';
  } else if (/iphone|ipad/i.test(ua)) {
    os = 'iOS';
    deviceType = 'Mobile';
  } else if (/mac os x/i.test(ua)) os = 'MacOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  if (/ipad/i.test(ua)) deviceType = 'Tablet';

  if (/chrome/i.test(ua) && !/edge|edg/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/edge|edg/i.test(ua)) browser = 'Edge';
  else if (/msie|trident/i.test(ua)) browser = 'Internet Explorer';

  return { browser, os, deviceType };
}

motor.registerDomain(AnalyticsDomain);

module.exports = {};
