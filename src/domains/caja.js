const motor = require('../core/motor');
const db = require('../core/db');
const { EngineError } = require('../core/errors');

class CajaDomain {
  static domain = 'CAJA';

  static commands = {
    'abrir-turno': async function (user, payload, txClient = null) {
      const { montoInicial } = payload;
      const tenantId = user.cliente_id;
      const userId = user.id;

      // Verificar si hay un turno abierto
      const check = await (txClient || db).query(
        'SELECT id FROM caja_turnos WHERE tenant_id = $1 AND estado = $2',
        [tenantId, 'ABIERTO']
      );

      if (check.rows.length > 0) {
        throw new EngineError('TURNO_YA_ABIERTO', 'Ya existe un turno abierto para este local.');
      }

      await (txClient || db).query(
        'INSERT INTO caja_turnos (tenant_id, user_id, monto_inicial, estado) VALUES ($1, $2, $3, $4)',
        [tenantId, userId, montoInicial || 0, 'ABIERTO']
      );

      return { status: 'success', message: 'Turno abierto correctamente.' };
    },

    'registrar-movimiento': async function (user, payload, txClient = null) {
      const { tipo, monto, descripcion } = payload; // tipo: VENTA, GASTO, INGRESO
      const tenantId = user.cliente_id;

      const turno = await (txClient || db).query(
        'SELECT id FROM caja_turnos WHERE tenant_id = $1 AND estado = $2 LIMIT 1',
        [tenantId, 'ABIERTO']
      );

      if (turno.rows.length === 0) {
        throw new EngineError('NO_TURNO', 'No hay ningún turno abierto.');
      }

      const turnoId = turno.rows[0].id;

      await (txClient || db).query(
        'INSERT INTO caja_movimientos (turno_id, tipo, monto, descripcion, user_id) VALUES ($1, $2, $3, $4, $5)',
        [turnoId, tipo, monto, descripcion, user.id]
      );

      return { status: 'success', message: 'Movimiento registrado.' };
    },

    'cerrar-turno': async function (user, payload, txClient = null) {
      const tenantId = user.cliente_id;

      const turno = await (txClient || db).query(
        'SELECT id FROM caja_turnos WHERE tenant_id = $1 AND estado = $2 LIMIT 1',
        [tenantId, 'ABIERTO']
      );

      if (turno.rows.length === 0) {
        throw new EngineError('NO_TURNO', 'No hay ningún turno abierto.');
      }

      await (txClient || db).query(
        'UPDATE caja_turnos SET estado = $1, fecha_cierre = CURRENT_TIMESTAMP WHERE id = $2',
        ['CERRADO', turno.rows[0].id]
      );

      return { status: 'success', message: 'Turno cerrado correctamente.' };
    }
  };
}

motor.registerDomain(CajaDomain);

module.exports = {};
