/**
 * migrate_transport.js — Transport Management System
 * Run: node db_migrate_transport.js
 */
require('dotenv').config()
const { pool } = require("./pool")

const TABLES = [

`CREATE TABLE IF NOT EXISTS buses (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  school_id     INT NOT NULL,
  bus_number    VARCHAR(20) NOT NULL,
  plate_number  VARCHAR(20),
  capacity      INT DEFAULT 40,
  gps_device_id VARCHAR(100),
  status        VARCHAR(20) DEFAULT 'Active',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  INDEX idx_buses_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS drivers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  school_id     INT NOT NULL,
  name          VARCHAR(150) NOT NULL,
  phone         VARCHAR(20),
  license_no    VARCHAR(50),
  face_id_hash  VARCHAR(255),
  fingerprint_hash VARCHAR(255),
  bus_id        INT,
  status        VARCHAR(20) DEFAULT 'Active',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (bus_id) REFERENCES buses(id),
  INDEX idx_drivers_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS transport_routes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  school_id     INT NOT NULL,
  route_name    VARCHAR(100) NOT NULL,
  bus_id        INT,
  driver_id     INT,
  start_time    TIME,
  end_time      TIME,
  route_type    VARCHAR(20) DEFAULT 'Both',
  status        VARCHAR(20) DEFAULT 'Active',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)  REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (bus_id)     REFERENCES buses(id),
  FOREIGN KEY (driver_id)  REFERENCES drivers(id),
  INDEX idx_routes_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS route_stops (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  route_id    INT NOT NULL,
  stop_name   VARCHAR(150) NOT NULL,
  stop_order  INT NOT NULL,
  latitude    DECIMAL(10,8),
  longitude   DECIMAL(11,8),
  pickup_time TIME,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (route_id) REFERENCES transport_routes(id) ON DELETE CASCADE,
  INDEX idx_stops_route (route_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS student_transport (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  school_id   INT NOT NULL,
  student_id  INT NOT NULL,
  route_id    INT,
  bus_id      INT,
  stop_id     INT,
  qr_code     VARCHAR(255),
  rfid_tag    VARCHAR(100),
  status      VARCHAR(20) DEFAULT 'Active',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)  REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (route_id)   REFERENCES transport_routes(id),
  FOREIGN KEY (bus_id)     REFERENCES buses(id),
  FOREIGN KEY (stop_id)    REFERENCES route_stops(id),
  UNIQUE KEY uq_student_transport (student_id),
  INDEX idx_st_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS transport_attendance (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  school_id     INT NOT NULL,
  student_id    INT NOT NULL,
  bus_id        INT,
  route_id      INT,
  driver_id     INT,
  scan_type     VARCHAR(10) DEFAULT 'QR',
  trip_type     VARCHAR(10) NOT NULL,
  status        VARCHAR(20) DEFAULT 'Boarded',
  scanned_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  latitude      DECIMAL(10,8),
  longitude     DECIMAL(11,8),
  notified      TINYINT(1) DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)  REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (bus_id)     REFERENCES buses(id),
  FOREIGN KEY (driver_id)  REFERENCES drivers(id),
  INDEX idx_ta_school  (school_id),
  INDEX idx_ta_student (student_id),
  INDEX idx_ta_date    (scanned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS driver_sessions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  driver_id    INT NOT NULL,
  bus_id       INT,
  route_id     INT,
  login_method VARCHAR(20) DEFAULT 'FaceID',
  login_time   DATETIME DEFAULT CURRENT_TIMESTAMP,
  logout_time  DATETIME,
  status       VARCHAR(20) DEFAULT 'Active',
  FOREIGN KEY (driver_id) REFERENCES drivers(id),
  FOREIGN KEY (bus_id)    REFERENCES buses(id),
  INDEX idx_ds_driver (driver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS bus_location (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  bus_id     INT NOT NULL,
  driver_id  INT,
  latitude   DECIMAL(10,8) NOT NULL,
  longitude  DECIMAL(11,8) NOT NULL,
  speed      DECIMAL(5,2) DEFAULT 0,
  heading    DECIMAL(5,2) DEFAULT 0,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bus_id)   REFERENCES buses(id),
  FOREIGN KEY (driver_id) REFERENCES drivers(id),
  INDEX idx_bl_bus  (bus_id),
  INDEX idx_bl_time (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

`CREATE TABLE IF NOT EXISTS transport_notifications (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  school_id    INT NOT NULL,
  student_id   INT NOT NULL,
  attendance_id INT,
  parent_phone VARCHAR(20),
  message      TEXT NOT NULL,
  channel      VARCHAR(20) DEFAULT 'WhatsApp',
  status       VARCHAR(20) DEFAULT 'Sent',
  sent_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id)  REFERENCES schools(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  INDEX idx_tn_school   (school_id),
  INDEX idx_tn_student  (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

]

async function migrate() {
  console.log('🚌  Running transport migrations...')
  try {
    for (const sql of TABLES) {
      const name = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1]
      await pool.execute(sql)
      console.log(`  ✓ ${name}`)
    }
    console.log('\n✅  Transport tables created.')
  } catch (err) {
    console.error('❌  Migration failed:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()