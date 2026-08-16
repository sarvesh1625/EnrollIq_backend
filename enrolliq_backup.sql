-- EnrollIQ Railway export
-- Generated 2026-08-16T03:22:46.069Z

SET FOREIGN_KEY_CHECKS=0;
SET NAMES utf8mb4;


-- ----------------------------
-- Table: academic_years
-- ----------------------------
DROP TABLE IF EXISTS `academic_years`;
CREATE TABLE `academic_years` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '0',
  `is_closed` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `academic_years` (`id`, `name`, `start_date`, `end_date`, `is_active`, `is_closed`, `created_at`) VALUES
(1, '2026-27', '2026-05-31 18:30:00', '2027-03-30 18:30:00', 1, 0, '2026-07-24 13:53:25'),
(2, '2027-28', '2027-05-31 18:30:00', '2028-03-30 18:30:00', 0, 0, '2026-07-24 13:53:25'),
(3, '2028-29', '2028-06-05 18:30:00', '2029-05-30 18:30:00', 0, 0, '2026-08-11 23:23:36');


-- ----------------------------
-- Table: ad_events
-- ----------------------------
DROP TABLE IF EXISTS `ad_events`;
CREATE TABLE `ad_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `ad_id` int DEFAULT NULL,
  `event_type` enum('click','enquiry','call') COLLATE utf8mb4_general_ci DEFAULT 'click',
  `source` varchar(100) COLLATE utf8mb4_general_ci DEFAULT 'google',
  `utm_campaign` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `utm_medium` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ip_address` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_general_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_events_school` (`school_id`),
  KEY `idx_events_date` (`created_at`),
  CONSTRAINT `ad_events_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: admissions
-- ----------------------------
DROP TABLE IF EXISTS `admissions`;
CREATE TABLE `admissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int DEFAULT NULL,
  `lead_id` int DEFAULT NULL,
  `student_name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `date_of_birth` date DEFAULT NULL,
  `grade_applied` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `parent_name` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `parent_phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `parent_email` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `docs_complete` tinyint(1) DEFAULT '0',
  `status` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'New',
  `admission_date` date DEFAULT NULL,
  `notes` text COLLATE utf8mb4_general_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `academic_year_id` int DEFAULT NULL,
  `student_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `school_id` (`school_id`),
  KEY `lead_id` (`lead_id`),
  KEY `idx_acad_year` (`academic_year_id`),
  CONSTRAINT `admissions_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `admissions_ibfk_2` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `admissions` (`id`, `school_id`, `lead_id`, `student_name`, `date_of_birth`, `grade_applied`, `parent_name`, `parent_phone`, `parent_email`, `docs_complete`, `status`, `admission_date`, `notes`, `created_at`, `updated_at`, `academic_year_id`, `student_id`) VALUES
(1, 3, NULL, 'sarvesh', '2023-03-07 18:30:00', 'Grade 1', 'Kondababu', '9177446486', 'Kondababu@gmail.com', 1, 'Admitted', NULL, '', '2026-08-13 21:22:33', '2026-08-13 21:24:39', 1, 1);


-- ----------------------------
-- Table: analytics_daily
-- ----------------------------
DROP TABLE IF EXISTS `analytics_daily`;
CREATE TABLE `analytics_daily` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int DEFAULT NULL,
  `date` date NOT NULL,
  `leads_count` int DEFAULT '0',
  `admissions_count` int DEFAULT '0',
  `fees_collected` decimal(12,2) DEFAULT '0.00',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_analytics` (`school_id`,`date`),
  CONSTRAINT `analytics_daily_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: announcements
-- ----------------------------
DROP TABLE IF EXISTS `announcements`;
CREATE TABLE `announcements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int DEFAULT NULL,
  `sent_by` int DEFAULT NULL,
  `title` varchar(200) COLLATE utf8mb4_general_ci NOT NULL,
  `body` text COLLATE utf8mb4_general_ci NOT NULL,
  `audience` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'All',
  `audience_filter` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `channel` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'WhatsApp',
  `recipient_count` int DEFAULT '0',
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Sent',
  `sent_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `sent_by` (`sent_by`),
  KEY `idx_announcements_school` (`school_id`),
  CONSTRAINT `announcements_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `announcements_ibfk_2` FOREIGN KEY (`sent_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: answer_sheets
-- ----------------------------
DROP TABLE IF EXISTS `answer_sheets`;
CREATE TABLE `answer_sheets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `exam_id` int NOT NULL,
  `student_id` int NOT NULL,
  `subject_id` int NOT NULL,
  `paper_id` int DEFAULT NULL,
  `image_path` varchar(500) DEFAULT NULL,
  `extracted_text` longtext,
  `ai_marks` decimal(6,2) DEFAULT NULL,
  `max_marks` decimal(6,2) DEFAULT NULL,
  `ai_feedback` text,
  `question_breakdown` LONGTEXT DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Pending',
  `graded_at` timestamp NULL DEFAULT NULL,
  `reviewed_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_as_exam` (`exam_id`),
  KEY `idx_as_student` (`student_id`),
  CONSTRAINT `answer_sheets_ibfk_1` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `answer_sheets_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `answer_sheets` (`id`, `school_id`, `exam_id`, `student_id`, `subject_id`, `paper_id`, `image_path`, `extracted_text`, `ai_marks`, `max_marks`, `ai_feedback`, `question_breakdown`, `status`, `graded_at`, `reviewed_by`, `created_at`) VALUES
(1, 3, 3, 1, 2, 3, 'typed', NULL, '0.00', '140.00', 'The student failed to provide any meaningful answers to the questions, resulting in a score of 0. This suggests a lack of understanding of the subject matter or a failure to follow instructions. The student should review the material and strive to provide complete and accurate answers in the future.', '[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]', 'Graded', '2026-08-14 23:52:35', NULL, '2026-08-14 23:52:35'),
(2, 3, 3, 1, 2, 5, 'typed', NULL, '35.00', '100.00', 'The student\'s performance was below average, with most answers being incomplete or incorrect. They seemed to rely heavily on multiple-choice options without providing any actual explanations or details. This approach significantly limited their ability to demonstrate a thorough understanding of the subject matter.', '[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]', 'Approved', '2026-08-15 03:43:26', 2, '2026-08-15 03:43:26'),
(3, 3, 1, 1, 1, 2, 'typed', NULL, '0.00', '70.00', 'The student\'s performance was extremely poor, with no meaningful answers provided for any question, indicating a significant lack of understanding of the subject matter.', '[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]', 'Graded', '2026-08-15 04:19:12', NULL, '2026-08-15 04:19:12'),
(4, 3, 3, 1, 2, 4, 'typed', NULL, '0.00', '60.00', 'The student\'s performance was poor, as they failed to provide any meaningful answers to the questions, with most answers being a single letter \'a\' which does not relate to the questions asked.', '[object Object],[object Object],[object Object],[object Object],[object Object]', 'Graded', '2026-08-15 04:22:42', NULL, '2026-08-15 04:22:42'),
(5, 3, 1, 1, 1, 1, 'typed', NULL, '0.00', '100.00', 'The student did not provide any answers to the questions, resulting in a complete loss of marks. This suggests a lack of understanding or effort. Improvement is necessary in all areas.', '[object Object],[object Object],[object Object],[object Object],[object Object]', 'Graded', '2026-08-15 04:25:46', NULL, '2026-08-15 04:25:46');


-- ----------------------------
-- Table: bulk_imports
-- ----------------------------
DROP TABLE IF EXISTS `bulk_imports`;
CREATE TABLE `bulk_imports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `import_type` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `filename` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `total_rows` int DEFAULT '0',
  `success_rows` int DEFAULT '0',
  `failed_rows` int DEFAULT '0',
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Processing',
  `errors` text COLLATE utf8mb4_general_ci,
  `imported_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `imported_by` (`imported_by`),
  KEY `idx_imports_school` (`school_id`),
  CONSTRAINT `bulk_imports_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bulk_imports_ibfk_2` FOREIGN KEY (`imported_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `bulk_imports` (`id`, `school_id`, `import_type`, `filename`, `total_rows`, `success_rows`, `failed_rows`, `status`, `errors`, `imported_by`, `created_at`) VALUES
(1, 3, 'students', NULL, 30, 30, 0, 'Completed', NULL, 2, '2026-08-13 21:31:16'),
(2, 3, 'leads', NULL, 20, 20, 0, 'Completed', NULL, 2, '2026-08-13 21:32:56');


-- ----------------------------
-- Table: bus_location
-- ----------------------------
DROP TABLE IF EXISTS `bus_location`;
CREATE TABLE `bus_location` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bus_id` int NOT NULL,
  `driver_id` int DEFAULT NULL,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `speed` decimal(5,2) DEFAULT '0.00',
  `heading` decimal(5,2) DEFAULT '0.00',
  `recorded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `driver_id` (`driver_id`),
  KEY `idx_bl_bus` (`bus_id`),
  KEY `idx_bl_time` (`recorded_at`),
  CONSTRAINT `bus_location_ibfk_1` FOREIGN KEY (`bus_id`) REFERENCES `buses` (`id`),
  CONSTRAINT `bus_location_ibfk_2` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: bus_location_history
-- ----------------------------
DROP TABLE IF EXISTS `bus_location_history`;
CREATE TABLE `bus_location_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bus_id` int NOT NULL,
  `latitude` decimal(10,7) NOT NULL,
  `longitude` decimal(10,7) NOT NULL,
  `speed` decimal(6,2) DEFAULT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bus_time` (`bus_id`,`recorded_at`),
  CONSTRAINT `bus_location_history_ibfk_1` FOREIGN KEY (`bus_id`) REFERENCES `buses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: bus_locations
-- ----------------------------
DROP TABLE IF EXISTS `bus_locations`;
CREATE TABLE `bus_locations` (
  `bus_id` int NOT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `speed` decimal(6,2) DEFAULT NULL,
  `heading` decimal(6,2) DEFAULT NULL,
  `trip_active` tinyint(1) NOT NULL DEFAULT '0',
  `trip_type` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `driver_name` varchar(80) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `ignition` tinyint(1) DEFAULT NULL,
  `satellites` int DEFAULT NULL,
  `battery` int DEFAULT NULL,
  `source` varchar(10) COLLATE utf8mb4_general_ci DEFAULT 'phone',
  `device_id` varchar(40) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `address` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`bus_id`),
  CONSTRAINT `bus_locations_ibfk_1` FOREIGN KEY (`bus_id`) REFERENCES `buses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: buses
-- ----------------------------
DROP TABLE IF EXISTS `buses`;
CREATE TABLE `buses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `bus_number` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `plate_number` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `capacity` int DEFAULT '40',
  `gps_device_id` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Active',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_buses_school` (`school_id`),
  CONSTRAINT `buses_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `buses` (`id`, `school_id`, `bus_number`, `plate_number`, `capacity`, `gps_device_id`, `status`, `created_at`) VALUES
(1, 3, 'bus 1', '12345', 40, NULL, 'Active', '2026-08-14 08:36:05');


-- ----------------------------
-- Table: cameras
-- ----------------------------
DROP TABLE IF EXISTS `cameras`;
CREATE TABLE `cameras` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(80) COLLATE utf8mb4_general_ci NOT NULL,
  `location` varchar(80) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `stream_url` text COLLATE utf8mb4_general_ci NOT NULL,
  `stream_type` varchar(10) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'hls',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `school_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cam_school` (`school_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: chatbot_sessions
-- ----------------------------
DROP TABLE IF EXISTS `chatbot_sessions`;
CREATE TABLE `chatbot_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `session_id` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `messages` text COLLATE utf8mb4_general_ci,
  `lead_data` text COLLATE utf8mb4_general_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_chat_school` (`school_id`),
  CONSTRAINT `chatbot_sessions_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: class_attendance
-- ----------------------------
DROP TABLE IF EXISTS `class_attendance`;
CREATE TABLE `class_attendance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `student_id` int NOT NULL,
  `class_name` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `date` date NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Present',
  `marked_by` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_general_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `academic_year_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance` (`student_id`,`date`),
  KEY `marked_by` (`marked_by`),
  KEY `idx_att_school` (`school_id`),
  KEY `idx_att_date` (`date`),
  KEY `idx_att_student` (`student_id`),
  KEY `idx_acad_year` (`academic_year_id`),
  CONSTRAINT `class_attendance_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `class_attendance_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `class_attendance_ibfk_3` FOREIGN KEY (`marked_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `class_attendance` (`id`, `school_id`, `student_id`, `class_name`, `date`, `status`, `marked_by`, `notes`, `created_at`, `academic_year_id`) VALUES
(1, 3, 5, NULL, '2026-08-14 18:30:00', 'Present', 4, NULL, '2026-08-15 09:36:22', NULL),
(2, 3, 32, NULL, '2026-08-14 18:30:00', 'Present', 4, NULL, '2026-08-15 09:36:22', NULL),
(3, 3, 29, NULL, '2026-08-14 18:30:00', 'Present', 4, NULL, '2026-08-15 09:36:23', NULL),
(4, 3, 23, NULL, '2026-08-14 18:30:00', 'Present', 4, NULL, '2026-08-15 09:36:23', NULL),
(5, 3, 17, NULL, '2026-08-14 18:30:00', 'Present', 4, NULL, '2026-08-15 09:36:24', NULL),
(6, 3, 11, NULL, '2026-08-14 18:30:00', 'Present', 4, NULL, '2026-08-15 09:36:24', NULL),
(7, 3, 1, NULL, '2026-08-14 18:30:00', 'Present', 4, NULL, '2026-08-15 09:36:25', NULL);


-- ----------------------------
-- Table: class_posts
-- ----------------------------
DROP TABLE IF EXISTS `class_posts`;
CREATE TABLE `class_posts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `academic_year_id` int DEFAULT NULL,
  `post_type` varchar(20) NOT NULL DEFAULT 'diary',
  `class_name` varchar(50) DEFAULT NULL,
  `section` varchar(10) DEFAULT NULL,
  `student_id` int DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `description` text,
  `subject` varchar(80) DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `post_date` date NOT NULL,
  `posted_by` int DEFAULT NULL,
  `posted_by_name` varchar(120) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `attachments` text,
  PRIMARY KEY (`id`),
  KEY `idx_cp_school` (`school_id`),
  KEY `idx_cp_class` (`school_id`,`class_name`),
  KEY `idx_cp_student` (`student_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `class_posts` (`id`, `school_id`, `academic_year_id`, `post_type`, `class_name`, `section`, `student_id`, `title`, `description`, `subject`, `due_date`, `post_date`, `posted_by`, `posted_by_name`, `created_at`, `attachments`) VALUES
(1, 3, 1, 'diary', 'Grade 1', NULL, NULL, 'howe work', 'test trials', NULL, NULL, '2026-08-14 18:30:00', 2, 'Krishna ', '2026-08-15 05:00:45', NULL),
(2, 3, 1, 'diary', 'Grade 1', NULL, NULL, 'Short Notes ', NULL, NULL, NULL, '2026-08-14 18:30:00', 2, 'Krishna ', '2026-08-15 10:07:49', NULL);


-- ----------------------------
-- Table: classes
-- ----------------------------
DROP TABLE IF EXISTS `classes`;
CREATE TABLE `classes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `section` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `teacher_id` int DEFAULT NULL,
  `academic_year` varchar(10) COLLATE utf8mb4_general_ci DEFAULT '2025-26',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_classes_school` (`school_id`),
  CONSTRAINT `classes_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: driver_sessions
-- ----------------------------
DROP TABLE IF EXISTS `driver_sessions`;
CREATE TABLE `driver_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `driver_id` int NOT NULL,
  `bus_id` int DEFAULT NULL,
  `route_id` int DEFAULT NULL,
  `login_method` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'FaceID',
  `login_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `logout_time` datetime DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Active',
  PRIMARY KEY (`id`),
  KEY `bus_id` (`bus_id`),
  KEY `idx_ds_driver` (`driver_id`),
  CONSTRAINT `driver_sessions_ibfk_1` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`),
  CONSTRAINT `driver_sessions_ibfk_2` FOREIGN KEY (`bus_id`) REFERENCES `buses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: drivers
-- ----------------------------
DROP TABLE IF EXISTS `drivers`;
CREATE TABLE `drivers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `license_no` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `face_id_hash` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `fingerprint_hash` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `bus_id` int DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Active',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `bus_id` (`bus_id`),
  KEY `idx_drivers_school` (`school_id`),
  CONSTRAINT `drivers_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `drivers_ibfk_2` FOREIGN KEY (`bus_id`) REFERENCES `buses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: exam_marks
-- ----------------------------
DROP TABLE IF EXISTS `exam_marks`;
CREATE TABLE `exam_marks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `exam_id` int NOT NULL,
  `student_id` int NOT NULL,
  `subject_id` int NOT NULL,
  `marks` decimal(6,2) DEFAULT '0.00',
  `max_marks` int DEFAULT '100',
  `grade` varchar(5) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `remarks` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `entered_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `academic_year_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_marks` (`exam_id`,`student_id`,`subject_id`),
  KEY `school_id` (`school_id`),
  KEY `subject_id` (`subject_id`),
  KEY `idx_marks_student` (`student_id`),
  KEY `idx_marks_exam` (`exam_id`),
  CONSTRAINT `exam_marks_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `exam_marks_ibfk_2` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `exam_marks_ibfk_3` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `exam_marks_ibfk_4` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `exam_marks` (`id`, `school_id`, `exam_id`, `student_id`, `subject_id`, `marks`, `max_marks`, `grade`, `remarks`, `entered_by`, `created_at`, `academic_year_id`) VALUES
(1, 3, 1, 5, 1, '84.00', 100, 'A', NULL, 2, '2026-08-14 08:16:21', NULL),
(2, 3, 1, 32, 1, '90.00', 100, 'A+', NULL, 2, '2026-08-14 08:16:21', NULL),
(3, 3, 1, 29, 1, '69.00', 100, 'B', NULL, 2, '2026-08-14 08:16:22', NULL),
(4, 3, 1, 23, 1, '48.00', 100, 'D', NULL, 2, '2026-08-14 08:16:22', NULL),
(5, 3, 1, 17, 1, '56.00', 100, 'C', NULL, 2, '2026-08-14 08:16:23', NULL),
(6, 3, 1, 11, 1, '99.00', 100, 'A+', NULL, 2, '2026-08-14 08:16:23', NULL),
(7, 3, 1, 1, 1, '70.00', 100, 'B+', NULL, 2, '2026-08-14 08:16:24', NULL),
(8, 3, 2, 5, 2, '48.00', 100, 'D', NULL, 2, '2026-08-14 08:20:05', NULL),
(9, 3, 2, 32, 2, '50.00', 100, 'C', NULL, 2, '2026-08-14 08:20:06', NULL),
(10, 3, 2, 29, 2, '60.00', 100, 'B', NULL, 2, '2026-08-14 08:20:06', NULL),
(11, 3, 2, 23, 2, '75.00', 100, 'B+', NULL, 2, '2026-08-14 08:20:07', NULL),
(12, 3, 2, 17, 2, '85.00', 100, 'A', NULL, 2, '2026-08-14 08:20:07', NULL),
(13, 3, 2, 11, 2, '90.00', 100, 'A+', NULL, 2, '2026-08-14 08:20:08', NULL),
(14, 3, 2, 1, 2, '35.00', 100, 'D', NULL, 2, '2026-08-14 08:20:08', NULL),
(22, 3, 3, 1, 2, '80.00', 100, 'A', NULL, 2, '2026-08-15 03:52:04', NULL);


-- ----------------------------
-- Table: exam_questions
-- ----------------------------
DROP TABLE IF EXISTS `exam_questions`;
CREATE TABLE `exam_questions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `paper_id` int NOT NULL,
  `question_number` int DEFAULT NULL,
  `question_text` text NOT NULL,
  `question_type` varchar(20) DEFAULT 'Short Answer',
  `options` LONGTEXT DEFAULT NULL,
  `correct_answer` text,
  `marks` int DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `idx_eq_paper` (`paper_id`),
  CONSTRAINT `exam_questions_ibfk_1` FOREIGN KEY (`paper_id`) REFERENCES `question_papers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=70 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `exam_questions` (`id`, `paper_id`, `question_number`, `question_text`, `question_type`, `options`, `correct_answer`, `marks`) VALUES
(1, 1, 1, 'What is a matrix?', 'MCQ', 'A) A type of animal,B) A group of numbers arranged in rows and columns,C) A shape with five sides,D) A type of fruit', 'B) A group of numbers arranged in rows and columns', 10),
(2, 1, 2, 'Draw a simple matrix with 2 rows and 2 columns.', 'Short Answer', NULL, 'A 2x2 matrix with numbers or symbols', 15),
(3, 1, 3, 'If we have a matrix with 3 rows and 3 columns, how many numbers can we put in it?', 'Short Answer', NULL, '9', 10),
(4, 1, 4, 'What are the rows in a matrix?', 'MCQ', 'A) The numbers going up and down,B) The numbers going from side to side,C) The numbers in the corners,D) The numbers in the middle', 'B) The numbers going from side to side', 10),
(5, 1, 5, 'Create a simple matrix with your favorite numbers and explain what each row and column means to you.', 'Long Answer', NULL, 'A creative matrix with explanation', 55),
(6, 2, 1, 'What is the main purpose of agriculture?', 'MCQ', 'A) To grow crops and raise animals,B) To make medicines,C) To produce electricity,D) To build houses', 'A) To grow crops and raise animals', 5),
(7, 2, 2, 'What are microorganisms?', 'MCQ', 'A) Very small living organisms,B) Very big living organisms,C) Non-living things,D) Types of plants', 'A) Very small living organisms', 5),
(8, 2, 3, 'What is the difference between manure and fertilizers?', 'MCQ', 'A) Manure is organic, fertilizers are not,B) Fertilizers are organic, manure is not,C) Manure is used for plants, fertilizers are used for animals,D) Fertilizers are used for plants, manure is used for animals', 'A) Manure is organic, fertilizers are not', 10),
(9, 2, 4, 'What is combustion?', 'MCQ', 'A) A chemical process that produces heat and light,B) A physical process that produces heat and light,C) A process that produces only heat,D) A process that produces only light', 'A) A chemical process that produces heat and light', 10),
(10, 2, 5, 'Why are forests important?', 'MCQ', 'A) They provide oxygen and food,B) They provide shelter and medicines,C) They help maintain ecological balance,D) All of the above', 'D) All of the above', 10),
(11, 2, 6, 'What is the process by which living organisms produce new individuals of their own kind?', 'MCQ', 'A) Respiration,B) Photosynthesis,C) Reproduction,D) Decomposition', 'C) Reproduction', 10),
(12, 2, 7, 'What is adolescence?', 'MCQ', 'A) The period of life from childhood to adulthood,B) The period of life from adulthood to old age,C) The period of life from birth to childhood,D) The period of life from old age to death', 'A) The period of life from childhood to adulthood', 10),
(13, 2, 8, 'What is a force?', 'MCQ', 'A) A push or pull that can change the motion of an object,B) A push or pull that cannot change the motion of an object,C) A type of energy,D) A type of matter', 'A) A push or pull that can change the motion of an object', 10),
(14, 2, 9, 'What is friction?', 'MCQ', 'A) A force that opposes relative motion between surfaces in contact,B) A force that supports relative motion between surfaces in contact,C) A type of energy,D) A type of matter', 'A) A force that opposes relative motion between surfaces in contact', 10),
(15, 2, 10, 'What is sound?', 'MCQ', 'A) A type of vibration that produces a sensation in our ears,B) A type of energy that produces heat,C) A type of matter that produces light,D) A type of force that produces motion', 'A) A type of vibration that produces a sensation in our ears', 10),
(16, 3, 1, 'What is agriculture?', 'Short Answer', NULL, 'Agriculture is the practice of growing crops and raising animals for useful products.', 5),
(17, 3, 2, 'What are Kharif crops?', 'Short Answer', NULL, 'Kharif crops are generally grown during the rainy season.', 5),
(18, 3, 3, 'What is manure?', 'Short Answer', NULL, 'Manure is organic material that improves soil quality.', 5),
(19, 3, 4, 'What are microorganisms?', 'Short Answer', NULL, 'Microorganisms are very small living organisms that can usually be seen only with a microscope.', 5),
(20, 3, 5, 'What is combustion?', 'Short Answer', NULL, 'Combustion is a chemical process in which a substance reacts with oxygen and produces heat, often with light.', 5),
(21, 3, 6, 'What is deforestation?', 'Short Answer', NULL, 'Deforestation means the large-scale removal of forests.', 5),
(22, 3, 7, 'What is reproduction in animals?', 'Short Answer', NULL, 'Reproduction is the process by which living organisms produce new individuals of their own kind.', 5),
(23, 3, 8, 'What is adolescence?', 'Short Answer', NULL, 'Adolescence is the period of life when the body changes from childhood towards adulthood.', 5),
(24, 3, 9, 'What is force?', 'Short Answer', NULL, 'A force is a push or pull that can change the motion, direction or shape of an object.', 5),
(25, 3, 10, 'What is friction?', 'Short Answer', NULL, 'Friction is a force that opposes relative motion between surfaces in contact.', 5),
(26, 3, 11, 'What is sound?', 'Short Answer', NULL, 'Sound is produced by vibrating objects.', 5),
(27, 3, 12, 'What is light?', 'Short Answer', NULL, 'Light enables us to see objects.', 5),
(28, 3, 13, 'What is the importance of forests?', 'Long Answer', NULL, 'Forests provide oxygen, food, shelter, medicines and help maintain ecological balance.', 10),
(29, 3, 14, 'How can we conserve plants and animals?', 'Long Answer', NULL, 'We can conserve plants and animals by protecting their habitats, reducing pollution, and creating wildlife sanctuaries and national parks.', 10),
(30, 3, 15, 'What is the difference between Kharif and Rabi crops?', 'Long Answer', NULL, 'Kharif crops are grown during the rainy season, while Rabi crops are grown during the winter season.', 10),
(31, 3, 16, 'What are the uses of microorganisms?', 'Long Answer', NULL, 'Microorganisms are used in making curd, bread, medicines, and some fermented foods.', 10),
(32, 3, 17, 'What is the process of combustion?', 'Long Answer', NULL, 'Combustion is a chemical process in which a substance reacts with oxygen and produces heat, often with light.', 10),
(33, 3, 18, 'What are the effects of deforestation?', 'Long Answer', NULL, 'Deforestation can lead to loss of biodiversity, soil erosion, and increased greenhouse gas emissions.', 10),
(34, 3, 19, 'What is the importance of conservation of plants and animals?', 'Long Answer', NULL, 'Conservation of plants and animals is important to maintain ecological balance, preserve biodiversity, and ensure the survival of species.', 10),
(35, 3, 20, 'How can we reduce friction?', 'Long Answer', NULL, 'We can reduce friction by using lubricants such as oil and grease, and by using rolling friction instead of sliding friction.', 10),
(36, 4, 1, 'What is the main purpose of agriculture?', 'MCQ', 'A) To grow crops and raise animals for useful products,B) To make medicines and some fermented foods,C) To provide oxygen, food, shelter, medicines and help maintain ecological balance,D) To produce products such as coke, coal tar and coal gas', 'A) To grow crops and raise animals for useful products', 5),
(37, 4, 2, 'What are microorganisms?', 'Short Answer', NULL, 'Very small living organisms that can usually be seen only with a microscope', 10),
(38, 4, 3, 'What is the difference between Kharif and Rabi crops?', 'Short Answer', NULL, 'Kharif crops are grown during the rainy season, while Rabi crops are grown during the winter season', 10),
(39, 4, 4, 'What is combustion?', 'MCQ', 'A) A process of growing crops,B) A chemical process in which a substance reacts with oxygen and produces heat,C) A method of food preservation,D) A type of microorganism', 'B) A chemical process in which a substance reacts with oxygen and produces heat', 5),
(40, 4, 5, 'What is the importance of forests?', 'Long Answer', NULL, 'Forests provide oxygen, food, shelter, medicines and help maintain ecological balance', 30),
(43, 5, 1, 'What is the main purpose of agriculture?', 'MCQ', 'A) To grow animals,B) To grow crops and raise animals for useful products,C) To make fertilizers,D) To build houses', 'B) To grow crops and raise animals for useful products', 5),
(44, 5, 2, 'What are microorganisms?', 'Short Answer', NULL, 'Very small living organisms that can usually be seen only with a microscope', 10),
(45, 5, 3, 'What is the difference between Kharif and Rabi crops?', 'Short Answer', NULL, 'Kharif crops are grown during the rainy season, while Rabi crops are grown during the winter season', 10),
(46, 5, 4, 'What is irrigation?', 'MCQ', 'A) Supplying water to crops at regular intervals,B) Cutting down trees,C) Growing crops,D) Raising animals', 'A) Supplying water to crops at regular intervals', 5),
(47, 5, 5, 'What is deforestation?', 'Short Answer', NULL, 'The large-scale removal of forests', 10),
(48, 5, 6, 'Why are forests important?', 'Long Answer', NULL, 'Forests provide oxygen, food, shelter, medicines and help maintain ecological balance', 30),
(49, 5, 7, 'What is reforestation?', 'MCQ', 'A) Cutting down trees,B) Planting trees again in areas where forests have been destroyed,C) Growing crops,D) Raising animals', 'B) Planting trees again in areas where forests have been destroyed', 5),
(50, 5, 8, 'What is combustion?', 'Short Answer', NULL, 'A chemical process in which a substance reacts with oxygen and produces heat, often with light', 10),
(51, 5, 9, 'What is friction?', 'MCQ', 'A) A force that helps us walk,B) A force that opposes relative motion between surfaces in contact,C) A type of energy,D) A type of matter', 'B) A force that opposes relative motion between surfaces in contact', 5),
(52, 5, 10, 'What is sound?', 'Short Answer', NULL, 'A vibration that travels through a medium, such as air, water, or solids', 10),
(53, 6, 1, 'What is the main purpose of agriculture?', 'MCQ', 'A) To grow crops and raise animals for useful products,B) To protect plants and animals,C) To make fossil fuels,D) To generate electricity', 'A) To grow crops and raise animals for useful products', 5),
(54, 6, 2, 'What are microorganisms?', 'Short Answer', NULL, 'Microorganisms are very small living organisms that can usually be seen only with a microscope.', 10),
(55, 6, 3, 'What is the difference between Kharif and Rabi crops?', 'Short Answer', NULL, 'Kharif crops are grown during the rainy season, while Rabi crops are grown during the winter season.', 10),
(56, 6, 4, 'What is combustion?', 'MCQ', 'A) A chemical process in which a substance reacts with oxygen and produces heat, often with light,B) A process of generating electricity,C) A way of protecting plants and animals,D) A method of making fossil fuels', 'A) A chemical process in which a substance reacts with oxygen and produces heat, often with light', 5),
(57, 6, 5, 'Why is it important to conserve plants and animals?', 'Long Answer', NULL, 'Plants and animals are important for our ecosystem, and conserving them helps maintain ecological balance, provides oxygen, food, shelter, and medicines, and supports biodiversity.', 30),
(58, 6, 6, 'What is the role of manure and fertilizers in crop production?', 'Short Answer', NULL, 'Manure is organic material that improves soil quality, while fertilizers provide specific nutrients to plants.', 10),
(59, 6, 7, 'What is irrigation, and why is it important?', 'Short Answer', NULL, 'Irrigation is the process of supplying water to crops at regular intervals, and it is important for plant growth and crop production.', 10),
(60, 6, 8, 'What are the benefits of using vaccines?', 'MCQ', 'A) Vaccines help protect the body from certain infectious diseases,B) Vaccines are used to generate electricity,C) Vaccines are a type of fertilizer,D) Vaccines are used to make fossil fuels', 'A) Vaccines help protect the body from certain infectious diseases', 5),
(61, 6, 9, 'What is the importance of forests, and how can we conserve them?', 'Long Answer', NULL, 'Forests provide oxygen, food, shelter, medicines, and help maintain ecological balance. We can conserve them by reducing deforestation, planting trees, and supporting wildlife sanctuaries and national parks.', 20),
(62, 7, 1, 'What is the main purpose of agriculture?', 'MCQ', 'A) To grow flowers,B) To raise animals and grow crops for useful products,C) To build houses,D) To make toys', 'B) To raise animals and grow crops for useful products', 5),
(63, 7, 2, 'What is a microorganism?', 'Short Answer', NULL, 'A very small living organism that can usually be seen only with a microscope', 10),
(64, 7, 3, 'What are fossil fuels?', 'MCQ', 'A) Foods that are good for us,B) Fuels formed from the remains of organisms over millions of years,C) Toys made of plastic,D) Types of animals', 'B) Fuels formed from the remains of organisms over millions of years', 5),
(65, 7, 4, 'Why is it important to conserve plants and animals?', 'Short Answer', NULL, 'Because they provide oxygen, food, shelter, and help maintain ecological balance', 15),
(66, 7, 5, 'What is the process called when plants and animals produce new individuals of their own kind?', 'MCQ', 'A) Respiration,B) Photosynthesis,C) Reproduction,D) Decomposition', 'C) Reproduction', 5),
(67, 7, 6, 'What is friction?', 'Short Answer', NULL, 'A force that opposes relative motion between surfaces in contact', 10),
(68, 7, 7, 'What is the purpose of vaccines?', 'MCQ', 'A) To make us stronger,B) To protect the body from certain infectious diseases,C) To help us run faster,D) To make us more intelligent', 'B) To protect the body from certain infectious diseases', 5),
(69, 7, 8, 'What is the importance of balanced diet, personal hygiene, exercise, and adequate sleep during adolescence?', 'Long Answer', NULL, 'A balanced diet, personal hygiene, exercise, and adequate sleep are important during adolescence because they help the body grow and develop properly, and maintain overall health and well-being', 40);


-- ----------------------------
-- Table: exams
-- ----------------------------
DROP TABLE IF EXISTS `exams`;
CREATE TABLE `exams` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `class_name` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `exam_type` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'Unit Test',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `academic_year` varchar(10) COLLATE utf8mb4_general_ci DEFAULT '2025-26',
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Upcoming',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `academic_year_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_exams_school` (`school_id`),
  CONSTRAINT `exams_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `exams` (`id`, `school_id`, `name`, `class_name`, `exam_type`, `start_date`, `end_date`, `academic_year`, `status`, `created_at`, `academic_year_id`) VALUES
(1, 3, 'mock test', 'Grade 1', 'Unit Test', '2026-08-14 18:30:00', '2026-08-16 18:30:00', '2025-26', 'Upcoming', '2026-08-14 03:36:34', 1),
(2, 3, 'English', 'Grade 1', 'Unit Test', '2026-08-13 18:30:00', '2026-09-02 18:30:00', '2025-26', 'Upcoming', '2026-08-14 08:19:24', 1),
(3, 3, 'unit test', 'Grade 1', 'Unit Test', '2026-08-18 18:30:00', '2026-08-26 18:30:00', '2025-26', 'Upcoming', '2026-08-14 08:25:56', 1);


-- ----------------------------
-- Table: fee_structures
-- ----------------------------
DROP TABLE IF EXISTS `fee_structures`;
CREATE TABLE `fee_structures` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int DEFAULT NULL,
  `name` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `class` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `academic_year` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `academic_year_id` int DEFAULT NULL,
  `class_name` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `fee_type` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `term` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `due_day` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `school_id` (`school_id`),
  KEY `idx_acad_year` (`academic_year_id`),
  CONSTRAINT `fee_structures_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: kit_items
-- ----------------------------
DROP TABLE IF EXISTS `kit_items`;
CREATE TABLE `kit_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) COLLATE utf8mb4_general_ci NOT NULL,
  `category` varchar(30) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Other',
  `price` decimal(8,2) NOT NULL DEFAULT '0.00',
  `has_sizes` tinyint(1) NOT NULL DEFAULT '0',
  `size_type` varchar(15) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: kit_template_items
-- ----------------------------
DROP TABLE IF EXISTS `kit_template_items`;
CREATE TABLE `kit_template_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `class` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `item_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tpl` (`class`,`item_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `kit_template_items_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `kit_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: lead_interactions
-- ----------------------------
DROP TABLE IF EXISTS `lead_interactions`;
CREATE TABLE `lead_interactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `lead_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `type` varchar(30) COLLATE utf8mb4_general_ci NOT NULL,
  `notes` text COLLATE utf8mb4_general_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_interactions_lead` (`lead_id`),
  CONSTRAINT `lead_interactions_ibfk_1` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lead_interactions_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: leads
-- ----------------------------
DROP TABLE IF EXISTS `leads`;
CREATE TABLE `leads` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int DEFAULT NULL,
  `parent_name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `child_grade` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `area` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `lead_source` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'Website',
  `keyword` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_general_ci,
  `status` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'New',
  `ai_score` int DEFAULT '0',
  `ai_label` varchar(10) COLLATE utf8mb4_general_ci DEFAULT 'Cold',
  `assigned_to` int DEFAULT NULL,
  `is_duplicate` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `academic_year_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `assigned_to` (`assigned_to`),
  KEY `idx_leads_school` (`school_id`),
  KEY `idx_leads_status` (`status`),
  KEY `idx_leads_ai_label` (`ai_label`),
  KEY `idx_leads_created` (`created_at`),
  KEY `idx_leads_year` (`academic_year_id`),
  CONSTRAINT `leads_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `leads_ibfk_2` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `leads` (`id`, `school_id`, `parent_name`, `phone`, `email`, `child_grade`, `area`, `lead_source`, `keyword`, `notes`, `status`, `ai_score`, `ai_label`, `assigned_to`, `is_duplicate`, `created_at`, `updated_at`, `academic_year_id`) VALUES
(1, 3, 'sarvesh', '9876543210', NULL, 'Grade 1', NULL, 'Landing Page', NULL, NULL, 'New', 52, 'Cold', NULL, 0, '2026-08-13 21:21:11', '2026-08-13 21:21:11', 1),
(2, 3, 'Padma Gupta', '9840631598', 'padma.gupta37@gmail.com', 'Grade 5', 'Miyapur', 'Form', NULL, NULL, 'New', 58, 'Warm', NULL, 0, '2026-08-13 21:32:57', '2026-08-13 21:32:57', 1),
(3, 3, 'Srinivas Sharma', '9642329978', 'srinivas.sharma1@gmail.com', 'Pre-KG', 'Hitech City', 'Walk-in', NULL, NULL, 'New', 80, 'Hot', NULL, 0, '2026-08-13 21:32:57', '2026-08-13 21:32:57', 1),
(4, 3, 'Ramesh Sharma', '9952283666', 'ramesh.sharma30@gmail.com', 'Grade 9', 'Madhapur', 'Referral', NULL, NULL, 'New', 83, 'Hot', NULL, 0, '2026-08-13 21:32:58', '2026-08-13 21:32:58', 1),
(5, 3, 'Sowmya Verma', '9136582440', 'sowmya.verma70@gmail.com', 'Grade 5', 'Gachibowli', 'Instagram', NULL, NULL, 'New', 63, 'Warm', NULL, 0, '2026-08-13 21:32:58', '2026-08-13 21:32:58', 1),
(6, 3, 'Sunita Sharma', '9895666072', 'sunita.sharma16@gmail.com', 'Grade 10', 'Madhapur', 'Referral', 'cbse school fees', NULL, 'New', 100, 'Hot', NULL, 0, '2026-08-13 21:32:59', '2026-08-13 21:32:59', 1),
(7, 3, 'Madhavi Chowdary', '9530939029', 'madhavi.chowdary24@gmail.com', 'Grade 8', 'Madhapur', 'Referral', 'top school in area', NULL, 'New', 91, 'Hot', NULL, 0, '2026-08-13 21:32:59', '2026-08-13 21:32:59', 1),
(8, 3, 'Ramesh Kumar', '9323941972', 'ramesh.kumar85@gmail.com', 'Grade 10', 'Gachibowli', 'Google Ads', NULL, NULL, 'New', 85, 'Hot', NULL, 0, '2026-08-13 21:33:00', '2026-08-13 21:33:00', 1),
(9, 3, 'Madhavi Gupta', '9315907387', 'madhavi.gupta19@gmail.com', 'Grade 6', 'Banjara Hills', 'WhatsApp', NULL, NULL, 'New', 68, 'Warm', NULL, 0, '2026-08-13 21:33:00', '2026-08-13 21:33:00', 1),
(10, 3, 'Prasad Iyer', '9514225633', 'prasad.iyer63@gmail.com', 'Grade 4', 'Kukatpally', 'Google Ads', 'admission 2026-27', NULL, 'New', 93, 'Hot', NULL, 0, '2026-08-13 21:33:01', '2026-08-13 21:33:01', 1),
(11, 3, 'Padma Verma', '9103040827', 'padma.verma71@gmail.com', 'Grade 7', 'Miyapur', 'Walk-in', NULL, NULL, 'New', 68, 'Warm', NULL, 0, '2026-08-13 21:33:01', '2026-08-13 21:33:01', 1),
(12, 3, 'Madhavi Nair', '9221021048', NULL, 'UKG', 'Hitech City', 'Form', NULL, NULL, 'New', 62, 'Warm', NULL, 0, '2026-08-13 21:33:02', '2026-08-13 21:33:02', 1),
(13, 3, 'Swathi Nair', '9429224228', 'swathi.nair22@gmail.com', 'LKG', 'Kondapur', 'Form', NULL, NULL, 'New', 70, 'Warm', NULL, 0, '2026-08-13 21:33:02', '2026-08-13 21:33:02', 1),
(14, 3, 'Swathi Sharma', '9833743404', NULL, 'Grade 6', 'Miyapur', 'Referral', 'cbse school fees', NULL, 'New', 83, 'Hot', NULL, 0, '2026-08-13 21:33:03', '2026-08-13 21:33:03', 1),
(15, 3, 'Kumar Reddy', '9472169070', 'kumar.reddy49@gmail.com', 'Grade 8', 'Miyapur', 'Facebook', 'cbse school fees', NULL, 'New', 81, 'Hot', NULL, 0, '2026-08-13 21:33:03', '2026-08-13 21:33:03', 1),
(16, 3, 'Madhavi Rao', '9571623213', 'madhavi.rao95@gmail.com', 'Grade 5', 'Madhapur', 'Form', NULL, NULL, 'New', 58, 'Warm', NULL, 0, '2026-08-13 21:33:04', '2026-08-13 21:33:04', 1),
(17, 3, 'Mohan Naidu', '9806979800', 'mohan.naidu54@gmail.com', 'Grade 1', 'Kondapur', 'Referral', 'admission 2026-27', NULL, 'New', 100, 'Hot', NULL, 0, '2026-08-13 21:33:04', '2026-08-13 21:33:04', 1),
(18, 3, 'Naveen Sharma', '9262348493', 'naveen.sharma62@gmail.com', 'Pre-KG', 'Kukatpally', 'Facebook', NULL, NULL, 'New', 73, 'Warm', NULL, 0, '2026-08-13 21:33:05', '2026-08-13 21:33:05', 1),
(19, 3, 'Sunita Kumar', '9492693990', 'sunita.kumar48@gmail.com', 'Grade 7', 'Banjara Hills', 'Referral', NULL, NULL, 'New', 71, 'Warm', NULL, 0, '2026-08-13 21:33:05', '2026-08-13 21:33:05', 1),
(20, 3, 'Geeta Sharma', '9673737616', 'geeta.sharma18@gmail.com', 'Grade 10', 'Madhapur', 'Referral', 'cbse school fees', NULL, 'New', 100, 'Hot', NULL, 0, '2026-08-13 21:33:06', '2026-08-13 21:33:06', 1),
(21, 3, 'Sunita Naidu', '9737466064', 'sunita.naidu32@gmail.com', 'Grade 7', 'Banjara Hills', 'WhatsApp', NULL, NULL, 'New', 68, 'Warm', NULL, 0, '2026-08-13 21:33:07', '2026-08-13 21:33:07', 1);


-- ----------------------------
-- Table: messages
-- ----------------------------
DROP TABLE IF EXISTS `messages`;
CREATE TABLE `messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int DEFAULT NULL,
  `sent_by` int DEFAULT NULL,
  `student_id` int DEFAULT NULL,
  `lead_id` int DEFAULT NULL,
  `recipient_name` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `recipient_phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `channel` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'WhatsApp',
  `body` text COLLATE utf8mb4_general_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Sent',
  `sent_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `sent_by` (`sent_by`),
  KEY `lead_id` (`lead_id`),
  KEY `idx_messages_school` (`school_id`),
  KEY `idx_messages_student` (`student_id`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`sent_by`) REFERENCES `users` (`id`),
  CONSTRAINT `messages_ibfk_3` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`),
  CONSTRAINT `messages_ibfk_4` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: notification_log
-- ----------------------------
DROP TABLE IF EXISTS `notification_log`;
CREATE TABLE `notification_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int DEFAULT NULL,
  `type` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `title` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `body` text COLLATE utf8mb4_general_ci,
  `link` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_school` (`school_id`),
  KEY `idx_notif_read` (`is_read`),
  CONSTRAINT `notification_log_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: notifications
-- ----------------------------
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `student_id` int DEFAULT NULL,
  `parent_phone` varchar(20) NOT NULL,
  `type` varchar(30) NOT NULL,
  `title` varchar(200) NOT NULL,
  `body` text,
  `link` varchar(60) DEFAULT NULL,
  `is_read` tinyint DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_phone` (`parent_phone`,`is_read`),
  KEY `idx_notif_school` (`school_id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `notifications` (`id`, `school_id`, `student_id`, `parent_phone`, `type`, `title`, `body`, `link`, `is_read`, `created_at`) VALUES
(1, 3, 1, '9177446486', 'diary', 'New Diary: Short Notes ', NULL, 'diary', 1, '2026-08-15 10:07:51'),
(2, 3, 5, '9798008398', 'diary', 'New Diary: Short Notes ', NULL, 'diary', 0, '2026-08-15 10:07:51'),
(3, 3, 11, '9325182357', 'diary', 'New Diary: Short Notes ', NULL, 'diary', 0, '2026-08-15 10:07:51'),
(4, 3, 17, '9746412435', 'diary', 'New Diary: Short Notes ', NULL, 'diary', 0, '2026-08-15 10:07:52'),
(5, 3, 23, '9150897049', 'diary', 'New Diary: Short Notes ', NULL, 'diary', 0, '2026-08-15 10:07:52'),
(6, 3, 29, '9119213748', 'diary', 'New Diary: Short Notes ', NULL, 'diary', 0, '2026-08-15 10:07:53'),
(7, 3, 32, '9177446486', 'diary', 'New Diary: Short Notes ', NULL, 'diary', 1, '2026-08-15 10:07:53');


-- ----------------------------
-- Table: payments
-- ----------------------------
DROP TABLE IF EXISTS `payments`;
CREATE TABLE `payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int DEFAULT NULL,
  `student_id` int DEFAULT NULL,
  `fee_type` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `paid_amount` decimal(10,2) DEFAULT '0.00',
  `due_date` date DEFAULT NULL,
  `paid_date` date DEFAULT NULL,
  `payment_mode` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Pending',
  `reference_no` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `academic_year_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `school_id` (`school_id`),
  KEY `student_id` (`student_id`),
  KEY `idx_acad_year` (`academic_year_id`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: question_papers
-- ----------------------------
DROP TABLE IF EXISTS `question_papers`;
CREATE TABLE `question_papers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `exam_id` int NOT NULL,
  `subject_id` int NOT NULL,
  `class_name` varchar(50) DEFAULT NULL,
  `topics` text,
  `difficulty` varchar(20) DEFAULT 'Medium',
  `total_marks` int DEFAULT '100',
  `generated_by` int DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Draft',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `subject_id` (`subject_id`),
  KEY `idx_qp_exam` (`exam_id`),
  KEY `idx_qp_school` (`school_id`),
  CONSTRAINT `question_papers_ibfk_1` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `question_papers_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `question_papers` (`id`, `school_id`, `exam_id`, `subject_id`, `class_name`, `topics`, `difficulty`, `total_marks`, `generated_by`, `status`, `created_at`) VALUES
(1, 3, 1, 1, 'Grade 1', 'matrix', 'Easy', 100, 2, 'Approved', '2026-08-14 03:37:42'),
(2, 3, 1, 1, 'Grade 1', '8th Class Science Simple Study Notes & Quick Revision Guide How to use this book: Read the concepts, learn the key points, and practice the questions at the end of each section. 1. Crop Production and Management • Agriculture is the practice of growing crops and raising animals for useful products. • Main agricultural practices include preparation of soil, sowing, adding manure or fertilizers, irrigation, protection from weeds, harvesting, and storage. • Kharif crops are generally grown during the rainy season, while Rabi crops are generally grown during the winter season. • Manure is organic material that improves soil quality. Fertilizers provide specific nutrients to plants. • Irrigation means supplying water to crops at regular intervals. 2. Microorganisms: Friend and Foe • Microorganisms are very small living organisms that can usually be seen only with a microscope. • Useful microorganisms help in making curd, bread, medicines and some fermented foods. • Some microorganisms cause diseases in humans, animals and plants. • Food preservation methods include drying, salting, sugaring, refrigeration and using preservatives. • Vaccines help protect the body from certain infectious diseases. 3. Coal and Petroleum • Coal and petroleum are fossil fuels formed from the remains of organisms over millions of years. • Coal is used as a fuel and is also used to produce products such as coke, coal tar and coal gas. • Petroleum is refined into useful products such as petrol, diesel, kerosene, lubricating oil and bitumen. • Fossil fuels are limited resources, so they should be used carefully. • Burning fossil fuels can cause air pollution and increase greenhouse gas emissions. 4. Combustion and Flame • Combustion is a chemical process in which a substance reacts with oxygen and produces heat, often with light. • A substance that burns is called combustible. • The ignition temperature is the lowest temperature at which a substance catches fire. • The flame of a candle has different zones with different temperatures. • Fire can be controlled by removing fuel, oxygen, or sufficient heat. 5. Conservation of Plants and Animals • Deforestation means the large-scale removal of forests. • Forests provide oxygen, food, shelter, medicines and help maintain ecological balance. • Wildlife sanctuaries, national parks and biosphere reserves help protect plants and animals. • Endangered species are species whose populations are at risk of disappearing. • Reforestation means planting trees again in areas where forests have been destroyed. 6. Reproduction in Animals • Reproduction is the process by which living organisms produce new individuals of their own kind. • Sexual reproduction generally involves male and female gametes. • Fertilisation is the fusion of male and female gametes to form a zygote. • In internal fertilisation, fertilisation occurs inside the female body; in external fertilisation, it occurs outside. • Some animals reproduce by laying eggs, while others give birth to young ones. 7. Reaching the Age of Adolescence • Adolescence is the period of life when the body changes from childhood towards adulthood. • Puberty is the stage when the reproductive organs mature and secondary sexual characteristics develop. • Hormones are chemical messengers produced by endocrine glands. • A balanced diet, personal hygiene, exercise and adequate sleep are important during adolescence. • Changes during puberty are normal and can occur at different ages for different people. 8. Force and Pressure • A force is a push or pull that can change the motion, direction or shape of an object. • The SI unit of force is the newton (N). • Pressure is force acting on a unit area. Pressure = Force / Area. • Liquids exert pressure on the walls and bottom of their containers. • Atmospheric pressure is the pressure exerted by the air around Earth. 9. Friction • Friction is a force that opposes relative motion between surfaces in contact. • Friction can be useful for walking, writing and braking vehicles. • Friction can also cause wear and produce unwanted heat. • Lubricants such as oil and grease can reduce friction. • Rolling friction is generally less than sliding friction, which is why wheels make movement easier. 10. Sound • Sound is produced by vibrating objects. • Sound needs a medium such as a solid, liquid or gas to travel; it cannot travel through a vacuum. • The frequency of vibration determines the pitch of a sound. • Greater amplitude generally produces a louder sound. • Unwanted and excessive sound is called noise and can cause noise pollution. 11. Chemical Effects of Electric Current • When electric current passes through certain liquids, it can cause chemical changes. • Electrolysis is the chemical decomposition of a substance using electric current. • Electroplating is the process of depositing a thin layer of one metal over another using electricity. • Electroplating can improve appearance and protect metals from corrosion. • Conducting liquids may contain dissolved salts, acids or bases. 12. Some Natural Phenomena • Lightning is a large electrical discharge in the atmosphere. • During a thunderstorm, staying inside a safe building or enclosed vehicle is safer than standing in open areas. • An earthquake is the sudden shaking of Earth\'s surface caused by movements within the Earth. • A seismograph is used to record earthquake vibrations. • Preparedness, strong construction and emergency planning can reduce earthquake risk. 13. Light • Light enables us to see objects. • Reflection is the bouncing back of light from a surface. • The angle of incidence is equal to the angle of reflection for regular reflection. • A plane mirror forms a virtual, erect image of the same size as the object. • Multiple reflections are used in devices such as periscopes and kaleidoscopes. 14. Stars and the Solar System • The Sun is a star and is at the centre of our solar system. • The eight planets revolve around the Sun in their orbits. •… [truncated — trim this down to the most relevant sections before generating]', 'Medium', 100, 2, 'Approved', '2026-08-14 04:21:19'),
(3, 3, 3, 2, 'Grade 1', '8th Class Science Simple Study Notes & Quick Revision Guide How to use this book: Read the concepts, learn the key points, and practice the questions at the end of each section. 1. Crop Production and Management • Agriculture is the practice of growing crops and raising animals for useful products. • Main agricultural practices include preparation of soil, sowing, adding manure or fertilizers, irrigation, protection from weeds, harvesting, and storage. • Kharif crops are generally grown during the rainy season, while Rabi crops are generally grown during the winter season. • Manure is organic material that improves soil quality. Fertilizers provide specific nutrients to plants. • Irrigation means supplying water to crops at regular intervals. 2. Microorganisms: Friend and Foe • Microorganisms are very small living organisms that can usually be seen only with a microscope. • Useful microorganisms help in making curd, bread, medicines and some fermented foods. • Some microorganisms cause diseases in humans, animals and plants. • Food preservation methods include drying, salting, sugaring, refrigeration and using preservatives. • Vaccines help protect the body from certain infectious diseases. 3. Coal and Petroleum • Coal and petroleum are fossil fuels formed from the remains of organisms over millions of years. • Coal is used as a fuel and is also used to produce products such as coke, coal tar and coal gas. • Petroleum is refined into useful products such as petrol, diesel, kerosene, lubricating oil and bitumen. • Fossil fuels are limited resources, so they should be used carefully. • Burning fossil fuels can cause air pollution and increase greenhouse gas emissions. 4. Combustion and Flame • Combustion is a chemical process in which a substance reacts with oxygen and produces heat, often with light. • A substance that burns is called combustible. • The ignition temperature is the lowest temperature at which a substance catches fire. • The flame of a candle has different zones with different temperatures. • Fire can be controlled by removing fuel, oxygen, or sufficient heat. 5. Conservation of Plants and Animals • Deforestation means the large-scale removal of forests. • Forests provide oxygen, food, shelter, medicines and help maintain ecological balance. • Wildlife sanctuaries, national parks and biosphere reserves help protect plants and animals. • Endangered species are species whose populations are at risk of disappearing. • Reforestation means planting trees again in areas where forests have been destroyed. 6. Reproduction in Animals • Reproduction is the process by which living organisms produce new individuals of their own kind. • Sexual reproduction generally involves male and female gametes. • Fertilisation is the fusion of male and female gametes to form a zygote. • In internal fertilisation, fertilisation occurs inside the female body; in external fertilisation, it occurs outside. • Some animals reproduce by laying eggs, while others give birth to young ones. 7. Reaching the Age of Adolescence • Adolescence is the period of life when the body changes from childhood towards adulthood. • Puberty is the stage when the reproductive organs mature and secondary sexual characteristics develop. • Hormones are chemical messengers produced by endocrine glands. • A balanced diet, personal hygiene, exercise and adequate sleep are important during adolescence. • Changes during puberty are normal and can occur at different ages for different people. 8. Force and Pressure • A force is a push or pull that can change the motion, direction or shape of an object. • The SI unit of force is the newton (N). • Pressure is force acting on a unit area. Pressure = Force / Area. • Liquids exert pressure on the walls and bottom of their containers. • Atmospheric pressure is the pressure exerted by the air around Earth. 9. Friction • Friction is a force that opposes relative motion between surfaces in contact. • Friction can be useful for walking, writing and braking vehicles. • Friction can also cause wear and produce unwanted heat. • Lubricants such as oil and grease can reduce friction. • Rolling friction is generally less than sliding friction, which is why wheels make movement easier. 10. Sound • Sound is produced by vibrating objects. • Sound needs a medium such as a solid, liquid or gas to travel; it cannot travel through a vacuum. • The frequency of vibration determines the pitch of a sound. • Greater amplitude generally produces a louder sound. • Unwanted and excessive sound is called noise and can cause noise pollution. 11. Chemical Effects of Electric Current • When electric current passes through certain liquids, it can cause chemical changes. • Electrolysis is the chemical decomposition of a substance using electric current. • Electroplating is the process of depositing a thin layer of one metal over another using electricity. • Electroplating can improve appearance and protect metals from corrosion. • Conducting liquids may contain dissolved salts, acids or bases. 12. Some Natural Phenomena • Lightning is a large electrical discharge in the atmosphere. • During a thunderstorm, staying inside a safe building or enclosed vehicle is safer than standing in open areas. • An earthquake is the sudden shaking of Earth\'s surface caused by movements within the Earth. • A seismograph is used to record earthquake vibrations. • Preparedness, strong construction and emergency planning can reduce earthquake risk. 13. Light • Light enables us to see objects. • Reflection is the bouncing back of light from a surface. • The angle of incidence is equal to the angle of reflection for regular reflection. • A plane mirror forms a virtual, erect image of the same size as the object. • Multiple reflections are used in devices such as periscopes and kaleidoscopes. 14. Stars and the Solar System • The Sun is a star and is at the centre of our solar system. • The eight planets revolve around the Sun in their orbits. •… [truncated — trim this down to the most relevant sections before generating]', 'Hard', 100, 2, 'Approved', '2026-08-14 09:18:52'),
(4, 3, 3, 2, 'Grade 1', '8th Class Science Simple Study Notes & Quick Revision Guide How to use this book: Read the concepts, learn the key points, and practice the questions at the end of each section. 1. Crop Production and Management • Agriculture is the practice of growing crops and raising animals for useful products. • Main agricultural practices include preparation of soil, sowing, adding manure or fertilizers, irrigation, protection from weeds, harvesting, and storage. • Kharif crops are generally grown during the rainy season, while Rabi crops are generally grown during the winter season. • Manure is organic material that improves soil quality. Fertilizers provide specific nutrients to plants. • Irrigation means supplying water to crops at regular intervals. 2. Microorganisms: Friend and Foe • Microorganisms are very small living organisms that can usually be seen only with a microscope. • Useful microorganisms help in making curd, bread, medicines and some fermented foods. • Some microorganisms cause diseases in humans, animals and plants. • Food preservation methods include drying, salting, sugaring, refrigeration and using preservatives. • Vaccines help protect the body from certain infectious diseases. 3. Coal and Petroleum • Coal and petroleum are fossil fuels formed from the remains of organisms over millions of years. • Coal is used as a fuel and is also used to produce products such as coke, coal tar and coal gas. • Petroleum is refined into useful products such as petrol, diesel, kerosene, lubricating oil and bitumen. • Fossil fuels are limited resources, so they should be used carefully. • Burning fossil fuels can cause air pollution and increase greenhouse gas emissions. 4. Combustion and Flame • Combustion is a chemical process in which a substance reacts with oxygen and produces heat, often with light. • A substance that burns is called combustible. • The ignition temperature is the lowest temperature at which a substance catches fire. • The flame of a candle has different zones with different temperatures. • Fire can be controlled by removing fuel, oxygen, or sufficient heat. 5. Conservation of Plants and Animals • Deforestation means the large-scale removal of forests. • Forests provide oxygen, food, shelter, medicines and help maintain ecological balance. • Wildlife sanctuaries, national parks and biosphere reserves help protect plants and animals. • Endangered species are species whose populations are at risk of disappearing. • Reforestation means planting trees again in areas where forests have been destroyed. 6. Reproduction in Animals • Reproduction is the process by which living organisms produce new individuals of their own kind. • Sexual reproduction generally involves male and female gametes. • Fertilisation is the fusion of male and female gametes to form a zygote. • In internal fertilisation, fertilisation occurs inside the female body; in external fertilisation, it occurs outside. • Some animals reproduce by laying eggs, while others give birth to young ones. 7. Reaching the Age of Adolescence • Adolescence is the period of life when the body changes from childhood towards adulthood. • Puberty is the stage when the reproductive organs mature and secondary sexual characteristics develop. • Hormones are chemical messengers produced by endocrine glands. • A balanced diet, personal hygiene, exercise and adequate sleep are important during adolescence. • Changes during puberty are normal and can occur at different ages for different people. 8. Force and Pressure • A force is a push or pull that can change the motion, direction or shape of an object. • The SI unit of force is the newton (N). • Pressure is force acting on a unit area. Pressure = Force / Area. • Liquids exert pressure on the walls and bottom of their containers. • Atmospheric pressure is the pressure exerted by the air around Earth. 9. Friction • Friction is a force that opposes relative motion between surfaces in contact. • Friction can be useful for walking, writing and braking vehicles. • Friction can also cause wear and produce unwanted heat. • Lubricants such as oil and grease can reduce friction. • Rolling friction is generally less than sliding friction, which is why wheels make movement easier. 10. Sound • Sound is produced by vibrating objects. • Sound needs a medium such as a solid, liquid or gas to travel; it cannot travel through a vacuum. • The frequency of vibration determines the pitch of a sound. • Greater amplitude generally produces a louder sound. • Unwanted and excessive sound is called noise and can cause noise pollution. 11. Chemical Effects of Electric Current • When electric current passes through certain liquids, it can cause chemical changes. • Electrolysis is the chemical decomposition of a substance using electric current. • Electroplating is the process of depositing a thin layer of one metal over another using electricity. • Electroplating can improve appearance and protect metals from corrosion. • Conducting liquids may contain dissolved salts, acids or bases. 12. Some Natural Phenomena • Lightning is a large electrical discharge in the atmosphere. • During a thunderstorm, staying inside a safe building or enclosed vehicle is safer than standing in open areas. • An earthquake is the sudden shaking of Earth\'s surface caused by movements within the Earth. • A seismograph is used to record earthquake vibrations. • Preparedness, strong construction and emergency planning can reduce earthquake risk. 13. Light • Light enables us to see objects. • Reflection is the bouncing back of light from a surface. • The angle of incidence is equal to the angle of reflection for regular reflection. • A plane mirror forms a virtual, erect image of the same size as the object. • Multiple reflections are used in devices such as periscopes and kaleidoscopes. 14. Stars and the Solar System • The Sun is a star and is at the centre of our solar system. • The eight planets revolve around the Sun in their orbits. •… [truncated — trim this down to the most relevant sections before generating]', 'Hard', 100, 2, 'Approved', '2026-08-14 09:26:56'),
(5, 3, 3, 2, 'Grade 1', '8th Class Science Simple Study Notes & Quick Revision Guide How to use this book: Read the concepts, learn the key points, and practice the questions at the end of each section. 1. Crop Production and Management • Agriculture is the practice of growing crops and raising animals for useful products. • Main agricultural practices include preparation of soil, sowing, adding manure or fertilizers, irrigation, protection from weeds, harvesting, and storage. • Kharif crops are generally grown during the rainy season, while Rabi crops are generally grown during the winter season. • Manure is organic material that improves soil quality. Fertilizers provide specific nutrients to plants. • Irrigation means supplying water to crops at regular intervals. 2. Microorganisms: Friend and Foe • Microorganisms are very small living organisms that can usually be seen only with a microscope. • Useful microorganisms help in making curd, bread, medicines and some fermented foods. • Some microorganisms cause diseases in humans, animals and plants. • Food preservation methods include drying, salting, sugaring, refrigeration and using preservatives. • Vaccines help protect the body from certain infectious diseases. 3. Coal and Petroleum • Coal and petroleum are fossil fuels formed from the remains of organisms over millions of years. • Coal is used as a fuel and is also used to produce products such as coke, coal tar and coal gas. • Petroleum is refined into useful products such as petrol, diesel, kerosene, lubricating oil and bitumen. • Fossil fuels are limited resources, so they should be used carefully. • Burning fossil fuels can cause air pollution and increase greenhouse gas emissions. 4. Combustion and Flame • Combustion is a chemical process in which a substance reacts with oxygen and produces heat, often with light. • A substance that burns is called combustible. • The ignition temperature is the lowest temperature at which a substance catches fire. • The flame of a candle has different zones with different temperatures. • Fire can be controlled by removing fuel, oxygen, or sufficient heat. 5. Conservation of Plants and Animals • Deforestation means the large-scale removal of forests. • Forests provide oxygen, food, shelter, medicines and help maintain ecological balance. • Wildlife sanctuaries, national parks and biosphere reserves help protect plants and animals. • Endangered species are species whose populations are at risk of disappearing. • Reforestation means planting trees again in areas where forests have been destroyed. 6. Reproduction in Animals • Reproduction is the process by which living organisms produce new individuals of their own kind. • Sexual reproduction generally involves male and female gametes. • Fertilisation is the fusion of male and female gametes to form a zygote. • In internal fertilisation, fertilisation occurs inside the female body; in external fertilisation, it occurs outside. • Some animals reproduce by laying eggs, while others give birth to young ones. 7. Reaching the Age of Adolescence • Adolescence is the period of life when the body changes from childhood towards adulthood. • Puberty is the stage when the reproductive organs mature and secondary sexual characteristics develop. • Hormones are chemical messengers produced by endocrine glands. • A balanced diet, personal hygiene, exercise and adequate sleep are important during adolescence. • Changes during puberty are normal and can occur at different ages for different people. 8. Force and Pressure • A force is a push or pull that can change the motion, direction or shape of an object. • The SI unit of force is the newton (N). • Pressure is force acting on a unit area. Pressure = Force / Area. • Liquids exert pressure on the walls and bottom of their containers. • Atmospheric pressure is the pressure exerted by the air around Earth. 9. Friction • Friction is a force that opposes relative motion between surfaces in contact. • Friction can be useful for walking, writing and braking vehicles. • Friction can also cause wear and produce unwanted heat. • Lubricants such as oil and grease can reduce friction. • Rolling friction is generally less than sliding friction, which is why wheels make movement easier. 10. Sound • Sound is produced by vibrating objects. • Sound needs a medium such as a solid, liquid or gas to travel; it cannot travel through a vacuum. • The frequency of vibration determines the pitch of a sound. • Greater amplitude generally produces a louder sound. • Unwanted and excessive sound is called noise and can cause noise pollution. 11. Chemical Effects of Electric Current • When electric current passes through certain liquids, it can cause chemical changes. • Electrolysis is the chemical decomposition of a substance using electric current. • Electroplating is the process of depositing a thin layer of one metal over another using electricity. • Electroplating can improve appearance and protect metals from corrosion. • Conducting liquids may contain dissolved salts, acids or bases. 12. Some Natural Phenomena • Lightning is a large electrical discharge in the atmosphere. • During a thunderstorm, staying inside a safe building or enclosed vehicle is safer than standing in open areas. • An earthquake is the sudden shaking of Earth\'s surface caused by movements within the Earth. • A seismograph is used to record earthquake vibrations. • Preparedness, strong construction and emergency planning can reduce earthquake risk. 13. Light • Light enables us to see objects. • Reflection is the bouncing back of light from a surface. • The angle of incidence is equal to the angle of reflection for regular reflection. • A plane mirror forms a virtual, erect image of the same size as the object. • Multiple reflections are used in devices such as periscopes and kaleidoscopes. 14. Stars and the Solar System • The Sun is a star and is at the centre of our solar system. • The eight planets revolve around the Sun in their orbits. •… [truncated — trim this down to the most relevant sections before generating]', 'Medium', 100, 2, 'Approved', '2026-08-15 00:08:08'),
(6, 3, 3, 2, 'Grade 1', '8th Class Science Simple Study Notes & Quick Revision Guide How to use this book: Read the concepts, learn the key points, and practice the questions at the end of each section. 1. Crop Production and Management • Agriculture is the practice of growing crops and raising animals for useful products. • Main agricultural practices include preparation of soil, sowing, adding manure or fertilizers, irrigation, protection from weeds, harvesting, and storage. • Kharif crops are generally grown during the rainy season, while Rabi crops are generally grown during the winter season. • Manure is organic material that improves soil quality. Fertilizers provide specific nutrients to plants. • Irrigation means supplying water to crops at regular intervals. 2. Microorganisms: Friend and Foe • Microorganisms are very small living organisms that can usually be seen only with a microscope. • Useful microorganisms help in making curd, bread, medicines and some fermented foods. • Some microorganisms cause diseases in humans, animals and plants. • Food preservation methods include drying, salting, sugaring, refrigeration and using preservatives. • Vaccines help protect the body from certain infectious diseases. 3. Coal and Petroleum • Coal and petroleum are fossil fuels formed from the remains of organisms over millions of years. • Coal is used as a fuel and is also used to produce products such as coke, coal tar and coal gas. • Petroleum is refined into useful products such as petrol, diesel, kerosene, lubricating oil and bitumen. • Fossil fuels are limited resources, so they should be used carefully. • Burning fossil fuels can cause air pollution and increase greenhouse gas emissions. 4. Combustion and Flame • Combustion is a chemical process in which a substance reacts with oxygen and produces heat, often with light. • A substance that burns is called combustible. • The ignition temperature is the lowest temperature at which a substance catches fire. • The flame of a candle has different zones with different temperatures. • Fire can be controlled by removing fuel, oxygen, or sufficient heat. 5. Conservation of Plants and Animals • Deforestation means the large-scale removal of forests. • Forests provide oxygen, food, shelter, medicines and help maintain ecological balance. • Wildlife sanctuaries, national parks and biosphere reserves help protect plants and animals. • Endangered species are species whose populations are at risk of disappearing. • Reforestation means planting trees again in areas where forests have been destroyed. 6. Reproduction in Animals • Reproduction is the process by which living organisms produce new individuals of their own kind. • Sexual reproduction generally involves male and female gametes. • Fertilisation is the fusion of male and female gametes to form a zygote. • In internal fertilisation, fertilisation occurs inside the female body; in external fertilisation, it occurs outside. • Some animals reproduce by laying eggs, while others give birth to young ones. 7. Reaching the Age of Adolescence • Adolescence is the period of life when the body changes from childhood towards adulthood. • Puberty is the stage when the reproductive organs mature and secondary sexual characteristics develop. • Hormones are chemical messengers produced by endocrine glands. • A balanced diet, personal hygiene, exercise and adequate sleep are important during adolescence. • Changes during puberty are normal and can occur at different ages for different people. 8. Force and Pressure • A force is a push or pull that can change the motion, direction or shape of an object. • The SI unit of force is the newton (N). • Pressure is force acting on a unit area. Pressure = Force / Area. • Liquids exert pressure on the walls and bottom of their containers. • Atmospheric pressure is the pressure exerted by the air around Earth. 9. Friction • Friction is a force that opposes relative motion between surfaces in contact. • Friction can be useful for walking, writing and braking vehicles. • Friction can also cause wear and produce unwanted heat. • Lubricants such as oil and grease can reduce friction. • Rolling friction is generally less than sliding friction, which is why wheels make movement easier. 10. Sound • Sound is produced by vibrating objects. • Sound needs a medium such as a solid, liquid or gas to travel; it cannot travel through a vacuum. • The frequency of vibration determines the pitch of a sound. • Greater amplitude generally produces a louder sound. • Unwanted and excessive sound is called noise and can cause noise pollution. 11. Chemical Effects of Electric Current • When electric current passes through certain liquids, it can cause chemical changes. • Electrolysis is the chemical decomposition of a substance using electric current. • Electroplating is the process of depositing a thin layer of one metal over another using electricity. • Electroplating can improve appearance and protect metals from corrosion. • Conducting liquids may contain dissolved salts, acids or bases. 12. Some Natural Phenomena • Lightning is a large electrical discharge in the atmosphere. • During a thunderstorm, staying inside a safe building or enclosed vehicle is safer than standing in open areas. • An earthquake is the sudden shaking of Earth\'s surface caused by movements within the Earth. • A seismograph is used to record earthquake vibrations. • Preparedness, strong construction and emergency planning can reduce earthquake risk. 13. Light • Light enables us to see objects. • Reflection is the bouncing back of light from a surface. • The angle of incidence is equal to the angle of reflection for regular reflection. • A plane mirror forms a virtual, erect image of the same size as the object. • Multiple reflections are used in devices such as periscopes and kaleidoscopes. 14. Stars and the Solar System • The Sun is a star and is at the centre of our solar system. • The eight planets revolve around the Sun in their orbits. •… [truncated — trim this down to the most relevant sections before generating]', 'Medium', 100, 2, 'Approved', '2026-08-15 04:08:22'),
(7, 3, 3, 2, 'Grade 1', '8th Class Science Simple Study Notes & Quick Revision Guide How to use this book: Read the concepts, learn the key points, and practice the questions at the end of each section. 1. Crop Production and Management • Agriculture is the practice of growing crops and raising animals for useful products. • Main agricultural practices include preparation of soil, sowing, adding manure or fertilizers, irrigation, protection from weeds, harvesting, and storage. • Kharif crops are generally grown during the rainy season, while Rabi crops are generally grown during the winter season. • Manure is organic material that improves soil quality. Fertilizers provide specific nutrients to plants. • Irrigation means supplying water to crops at regular intervals. 2. Microorganisms: Friend and Foe • Microorganisms are very small living organisms that can usually be seen only with a microscope. • Useful microorganisms help in making curd, bread, medicines and some fermented foods. • Some microorganisms cause diseases in humans, animals and plants. • Food preservation methods include drying, salting, sugaring, refrigeration and using preservatives. • Vaccines help protect the body from certain infectious diseases. 3. Coal and Petroleum • Coal and petroleum are fossil fuels formed from the remains of organisms over millions of years. • Coal is used as a fuel and is also used to produce products such as coke, coal tar and coal gas. • Petroleum is refined into useful products such as petrol, diesel, kerosene, lubricating oil and bitumen. • Fossil fuels are limited resources, so they should be used carefully. • Burning fossil fuels can cause air pollution and increase greenhouse gas emissions. 4. Combustion and Flame • Combustion is a chemical process in which a substance reacts with oxygen and produces heat, often with light. • A substance that burns is called combustible. • The ignition temperature is the lowest temperature at which a substance catches fire. • The flame of a candle has different zones with different temperatures. • Fire can be controlled by removing fuel, oxygen, or sufficient heat. 5. Conservation of Plants and Animals • Deforestation means the large-scale removal of forests. • Forests provide oxygen, food, shelter, medicines and help maintain ecological balance. • Wildlife sanctuaries, national parks and biosphere reserves help protect plants and animals. • Endangered species are species whose populations are at risk of disappearing. • Reforestation means planting trees again in areas where forests have been destroyed. 6. Reproduction in Animals • Reproduction is the process by which living organisms produce new individuals of their own kind. • Sexual reproduction generally involves male and female gametes. • Fertilisation is the fusion of male and female gametes to form a zygote. • In internal fertilisation, fertilisation occurs inside the female body; in external fertilisation, it occurs outside. • Some animals reproduce by laying eggs, while others give birth to young ones. 7. Reaching the Age of Adolescence • Adolescence is the period of life when the body changes from childhood towards adulthood. • Puberty is the stage when the reproductive organs mature and secondary sexual characteristics develop. • Hormones are chemical messengers produced by endocrine glands. • A balanced diet, personal hygiene, exercise and adequate sleep are important during adolescence. • Changes during puberty are normal and can occur at different ages for different people. 8. Force and Pressure • A force is a push or pull that can change the motion, direction or shape of an object. • The SI unit of force is the newton (N). • Pressure is force acting on a unit area. Pressure = Force / Area. • Liquids exert pressure on the walls and bottom of their containers. • Atmospheric pressure is the pressure exerted by the air around Earth. 9. Friction • Friction is a force that opposes relative motion between surfaces in contact. • Friction can be useful for walking, writing and braking vehicles. • Friction can also cause wear and produce unwanted heat. • Lubricants such as oil and grease can reduce friction. • Rolling friction is generally less than sliding friction, which is why wheels make movement easier. 10. Sound • Sound is produced by vibrating objects. • Sound needs a medium such as a solid, liquid or gas to travel; it cannot travel through a vacuum. • The frequency of vibration determines the pitch of a sound. • Greater amplitude generally produces a louder sound. • Unwanted and excessive sound is called noise and can cause noise pollution. 11. Chemical Effects of Electric Current • When electric current passes through certain liquids, it can cause chemical changes. • Electrolysis is the chemical decomposition of a substance using electric current. • Electroplating is the process of depositing a thin layer of one metal over another using electricity. • Electroplating can improve appearance and protect metals from corrosion. • Conducting liquids may contain dissolved salts, acids or bases. 12. Some Natural Phenomena • Lightning is a large electrical discharge in the atmosphere. • During a thunderstorm, staying inside a safe building or enclosed vehicle is safer than standing in open areas. • An earthquake is the sudden shaking of Earth\'s surface caused by movements within the Earth. • A seismograph is used to record earthquake vibrations. • Preparedness, strong construction and emergency planning can reduce earthquake risk. 13. Light • Light enables us to see objects. • Reflection is the bouncing back of light from a surface. • The angle of incidence is equal to the angle of reflection for regular reflection. • A plane mirror forms a virtual, erect image of the same size as the object. • Multiple reflections are used in devices such as periscopes and kaleidoscopes. 14. Stars and the Solar System • The Sun is a star and is at the centre of our solar system. • The eight planets revolve around the Sun in their orbits. •… [truncated — trim this down to the most relevant sections before generating]', 'Medium', 100, 2, 'Draft', '2026-08-15 11:09:56');


-- ----------------------------
-- Table: report_card_insights
-- ----------------------------
DROP TABLE IF EXISTS `report_card_insights`;
CREATE TABLE `report_card_insights` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `student_id` int NOT NULL,
  `exam_id` int NOT NULL,
  `summary` text,
  `weak_subjects` LONGTEXT DEFAULT NULL,
  `strong_subjects` LONGTEXT DEFAULT NULL,
  `trend` varchar(20) DEFAULT NULL,
  `alert_level` varchar(20) DEFAULT 'None',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_student_exam` (`student_id`,`exam_id`),
  KEY `exam_id` (`exam_id`),
  CONSTRAINT `report_card_insights_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `report_card_insights_ibfk_2` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `report_card_insights` (`id`, `school_id`, `student_id`, `exam_id`, `summary`, `weak_subjects`, `strong_subjects`, `trend`, `alert_level`, `created_at`) VALUES
(1, 3, 5, 1, 'Kavya Chowdary scored 84% in Maths, indicating a strong start. There is no prior exam history to compare with. Overall, her performance is satisfactory.', '', 'Maths', 'Stable', 'None', '2026-08-14 08:17:06'),
(2, 3, 1, 3, 'Sarvesh is showing improvement in English with a current score of 80%, significantly higher than the past mock test and English exam scores. However, the past English exam score was quite low at 35%. Overall, the trend is positive but requires monitoring to ensure consistency.', 'English (past performance)', 'English (current performance)', 'Improving', 'Watch', '2026-08-15 03:55:33');


-- ----------------------------
-- Table: report_cards
-- ----------------------------
DROP TABLE IF EXISTS `report_cards`;
CREATE TABLE `report_cards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `student_id` int NOT NULL,
  `exam_id` int NOT NULL,
  `total_marks` decimal(8,2) DEFAULT '0.00',
  `max_total` decimal(8,2) DEFAULT '0.00',
  `percentage` decimal(5,2) DEFAULT '0.00',
  `grade` varchar(5) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `rank_in_class` int DEFAULT NULL,
  `attendance_pct` decimal(5,2) DEFAULT '0.00',
  `remarks` text COLLATE utf8mb4_general_ci,
  `generated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `academic_year_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_report` (`student_id`,`exam_id`),
  KEY `school_id` (`school_id`),
  KEY `exam_id` (`exam_id`),
  KEY `idx_rc_student` (`student_id`),
  KEY `idx_acad_year` (`academic_year_id`),
  CONSTRAINT `report_cards_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `report_cards_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `report_cards_ibfk_3` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `report_cards` (`id`, `school_id`, `student_id`, `exam_id`, `total_marks`, `max_total`, `percentage`, `grade`, `rank_in_class`, `attendance_pct`, `remarks`, `generated_at`, `academic_year_id`) VALUES
(1, 3, 1, 1, '70.00', '100.00', '70.00', 'B+', 4, '0.00', NULL, '2026-08-14 08:27:34', NULL),
(2, 3, 5, 1, '84.00', '100.00', '84.00', 'A', 3, '0.00', NULL, '2026-08-14 08:27:35', NULL),
(3, 3, 11, 1, '99.00', '100.00', '99.00', 'A+', 1, '0.00', NULL, '2026-08-14 08:27:37', NULL),
(4, 3, 17, 1, '56.00', '100.00', '56.00', 'C', 6, '0.00', NULL, '2026-08-14 08:27:38', NULL),
(5, 3, 23, 1, '48.00', '100.00', '48.00', 'D', 7, '0.00', NULL, '2026-08-14 08:27:39', NULL),
(6, 3, 29, 1, '69.00', '100.00', '69.00', 'B', 5, '0.00', NULL, '2026-08-14 08:27:40', NULL),
(7, 3, 32, 1, '90.00', '100.00', '90.00', 'A+', 2, '0.00', NULL, '2026-08-14 08:27:42', NULL),
(8, 3, 1, 2, '35.00', '100.00', '35.00', 'D', 7, '0.00', NULL, '2026-08-14 08:28:13', NULL),
(9, 3, 5, 2, '48.00', '100.00', '48.00', 'D', 6, '0.00', NULL, '2026-08-14 08:28:15', NULL),
(10, 3, 11, 2, '90.00', '100.00', '90.00', 'A+', 1, '0.00', NULL, '2026-08-14 08:28:16', NULL),
(11, 3, 17, 2, '85.00', '100.00', '85.00', 'A', 2, '0.00', NULL, '2026-08-14 08:28:17', NULL),
(12, 3, 23, 2, '75.00', '100.00', '75.00', 'B+', 3, '0.00', NULL, '2026-08-14 08:28:18', NULL),
(13, 3, 29, 2, '60.00', '100.00', '60.00', 'B', 4, '0.00', NULL, '2026-08-14 08:28:20', NULL),
(14, 3, 32, 2, '50.00', '100.00', '50.00', 'C', 5, '0.00', NULL, '2026-08-14 08:28:21', NULL),
(15, 3, 1, 3, '80.00', '100.00', '80.00', 'A', 1, '0.00', NULL, '2026-08-15 03:56:51', NULL);


-- ----------------------------
-- Table: route_stops
-- ----------------------------
DROP TABLE IF EXISTS `route_stops`;
CREATE TABLE `route_stops` (
  `id` int NOT NULL AUTO_INCREMENT,
  `route_id` int NOT NULL,
  `stop_name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `stop_order` int NOT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `pickup_time` time DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stops_route` (`route_id`),
  CONSTRAINT `route_stops_ibfk_1` FOREIGN KEY (`route_id`) REFERENCES `transport_routes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: school_ads
-- ----------------------------
DROP TABLE IF EXISTS `school_ads`;
CREATE TABLE `school_ads` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `campaign_name` varchar(200) COLLATE utf8mb4_general_ci NOT NULL,
  `google_ads_account` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `google_campaign_id` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `landing_slug` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Active','Paused','Draft') COLLATE utf8mb4_general_ci DEFAULT 'Active',
  `monthly_budget` decimal(10,2) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `landing_slug` (`landing_slug`),
  KEY `idx_ads_school` (`school_id`),
  KEY `idx_ads_slug` (`landing_slug`),
  CONSTRAINT `school_ads_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `school_ads` (`id`, `school_id`, `campaign_name`, `google_ads_account`, `google_campaign_id`, `landing_slug`, `status`, `monthly_budget`, `created_at`) VALUES
(1, 3, 'Vidya Mandir Ads', NULL, NULL, 'vidya-mandir-3', 'Active', NULL, '2026-08-13 21:20:03');


-- ----------------------------
-- Table: school_faculty
-- ----------------------------
DROP TABLE IF EXISTS `school_faculty`;
CREATE TABLE `school_faculty` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `role` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `bio` varchar(300) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `photo_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_faculty_school` (`school_id`,`sort_order`),
  CONSTRAINT `school_faculty_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: school_features
-- ----------------------------
DROP TABLE IF EXISTS `school_features`;
CREATE TABLE `school_features` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `feature_key` varchar(50) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '0',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_school_feature` (`school_id`,`feature_key`),
  KEY `idx_sf_school` (`school_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `school_features` (`id`, `school_id`, `feature_key`, `enabled`, `updated_at`) VALUES
(1, 3, 'ai_exam_system', 1, '2026-08-15 11:15:12');


-- ----------------------------
-- Table: school_gallery
-- ----------------------------
DROP TABLE IF EXISTS `school_gallery`;
CREATE TABLE `school_gallery` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `image_url` varchar(500) COLLATE utf8mb4_general_ci NOT NULL,
  `caption` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gallery_school` (`school_id`),
  CONSTRAINT `school_gallery_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `school_gallery` (`id`, `school_id`, `image_url`, `caption`, `sort_order`, `created_at`) VALUES
(1, 3, '/api/discovery/gallery/gallery_3_1782119656742_y9r8dvqbm3.jpg', NULL, 0, '2026-06-22 09:14:16'),
(2, 3, '/api/discovery/gallery/gallery_3_1782119656752_g0u4g2omx28.jpg', NULL, 0, '2026-06-22 09:14:16'),
(3, 3, '/api/discovery/gallery/gallery_3_1782119656759_fob0uin9den.jpg', NULL, 0, '2026-06-22 09:14:16'),
(4, 3, '/api/discovery/gallery/gallery_3_1782119656764_9pqop4zyrj8.jpg', NULL, 0, '2026-06-22 09:14:16'),
(5, 3, '/api/discovery/gallery/gallery_3_1782119741508_zyu6o3507fl.jpg', NULL, 0, '2026-06-22 09:15:41');


-- ----------------------------
-- Table: school_testimonials
-- ----------------------------
DROP TABLE IF EXISTS `school_testimonials`;
CREATE TABLE `school_testimonials` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `parent_name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `child_grade` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `rating` int DEFAULT '5',
  `review` text COLLATE utf8mb4_general_ci NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_test_school` (`school_id`),
  CONSTRAINT `school_testimonials_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: schools
-- ----------------------------
DROP TABLE IF EXISTS `schools`;
CREATE TABLE `schools` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_general_ci NOT NULL,
  `city` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `area` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `board` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `website` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `established` int DEFAULT NULL,
  `student_count` int DEFAULT NULL,
  `fee_range` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `tags` text COLLATE utf8mb4_general_ci,
  `rating` decimal(3,1) DEFAULT '0.0',
  `review_count` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `subscription_plan` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'Basic',
  `subscription_status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Active',
  `subscription_expires` date DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Active',
  `grades_offered` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `fee_range_min` int DEFAULT '0',
  `fee_range_max` int DEFAULT '0',
  `banner_url` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_general_ci,
  `facilities` text COLLATE utf8mb4_general_ci,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `established_year` int DEFAULT NULL,
  `total_students_count` int DEFAULT '0',
  `is_listed` tinyint(1) DEFAULT '0',
  `tagline` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `highlights` text COLLATE utf8mb4_general_ci,
  `achievements` text COLLATE utf8mb4_general_ci,
  `affiliation_no` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `principal_name` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `medium` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'English',
  `school_timing` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `whatsapp_number` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `schools` (`id`, `name`, `city`, `area`, `board`, `phone`, `email`, `website`, `established`, `student_count`, `fee_range`, `tags`, `rating`, `review_count`, `is_active`, `created_at`, `updated_at`, `subscription_plan`, `subscription_status`, `subscription_expires`, `status`, `grades_offered`, `fee_range_min`, `fee_range_max`, `banner_url`, `description`, `facilities`, `latitude`, `longitude`, `established_year`, `total_students_count`, `is_listed`, `tagline`, `highlights`, `achievements`, `affiliation_no`, `principal_name`, `medium`, `school_timing`, `whatsapp_number`) VALUES
(1, 'Test School', 'Hyderabad', NULL, 'CBSE', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '0.0', 0, 1, '2026-06-06 06:17:33', '2026-08-13 07:41:56', 'enterprise', 'Active', NULL, 'Active', NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, 'English', NULL, NULL),
(2, 'zph school ', 'Hyderabad', NULL, 'CBSE', '9390683569', NULL, NULL, NULL, NULL, NULL, NULL, '0.0', 0, 1, '2026-06-06 06:40:26', '2026-08-12 22:57:44', 'basic', 'Active', NULL, 'Active', NULL, 28000, 500000, NULL, NULL, NULL, NULL, NULL, NULL, 0, 1, NULL, NULL, NULL, NULL, NULL, 'English', NULL, NULL),
(3, 'Vidya Mandir', 'Hyderabad', 'Madhapur', 'CBSE', '9390683569', NULL, NULL, NULL, NULL, NULL, NULL, '0.0', 0, 1, '2026-06-22 08:59:17', '2026-08-15 11:15:00', 'premium', 'Active', NULL, 'Active', 'LKG to Grade 10', 28000, 500000, '/api/discovery/banners/school_3_1782119529322.png', 'Vidya Mandir School is a dedicated institution committed to providing quality education in a nurturing and inspiring environment. We believe that education is the foundation of a successful future, and our goal is to help every student develop academically, socially, and morally.\n\nAt Vidya Mandir, we focus on creating a balanced learning experience that combines academic excellence with character development. Our experienced teachers encourage curiosity, creativity, critical thinking, and a love for lifelong learning. We strive to equip students with the knowledge, skills, and values needed to excel in an ever-changing world.\n\nThrough a student-centered approach, modern teaching methods, and a supportive atmosphere, we help students discover their potential and achieve their goals. We emphasize discipline, respect, integrity, and responsibility, ensuring that our students grow into confident and responsible citizens.\n\nAt Vidya Mandir School, we are not just educating students—we are shaping future leaders, innovators, and lifelong learners.', 'Library,Sports Ground,Science Lab,Computer Lab,Auditorium,Swimming Pool,CCTV,Transport,Playground,Dance Room,Physics Lab,Chemistry Lab,Canteen,Hii', NULL, NULL, 2000, 0, 1, 'Learning Today, Leading Tomorrow', '[{"heading":"Recognized for Outstanding Educational Standards","content":"Quality Education | Experienced Faculty | Smart Classrooms | Safe Campus | Holistic Development | Value-Based Learning | Modern Facilities | Student-Centric Approach."},{"heading":"Recognized for Outstanding Educational Standards","content":"Quality Education | Experienced Faculty | Smart Classrooms | Safe Campus | Holistic Development | Value-Based Learning | Modern Facilities | Student-Centric Approach."}]', NULL, NULL, NULL, 'English', NULL, NULL);


-- ----------------------------
-- Table: staff_documents
-- ----------------------------
DROP TABLE IF EXISTS `staff_documents`;
CREATE TABLE `staff_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `doc_type` varchar(40) COLLATE utf8mb4_general_ci NOT NULL,
  `file_path` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `original_name` varchar(160) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` varchar(15) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Uploaded',
  `uploaded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `staff_documents_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: staff_users
-- ----------------------------
DROP TABLE IF EXISTS `staff_users`;
CREATE TABLE `staff_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `user_id` int NOT NULL,
  `designation` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `department` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `employee_code` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `joined_date` date DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_staff_school` (`school_id`),
  CONSTRAINT `staff_users_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `staff_users_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: student_enrollments
-- ----------------------------
DROP TABLE IF EXISTS `student_enrollments`;
CREATE TABLE `student_enrollments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `academic_year_id` int NOT NULL,
  `class` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `section` varchar(5) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `roll_number` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` varchar(15) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Active',
  `promoted_to` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `remarks` varchar(160) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_enroll` (`student_id`,`academic_year_id`),
  KEY `idx_year_class` (`academic_year_id`,`class`),
  CONSTRAINT `student_enrollments_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `student_enrollments_ibfk_2` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `student_enrollments` (`id`, `student_id`, `academic_year_id`, `class`, `section`, `roll_number`, `status`, `promoted_to`, `remarks`, `created_at`) VALUES
(1, 1, 1, 'Grade 1', 'A', 'S-001', 'Active', NULL, NULL, '2026-08-13 22:23:26'),
(2, 2, 1, 'Pre-KG', 'B', 'PreKG-01', 'Active', NULL, NULL, '2026-08-13 22:23:26'),
(3, 3, 1, 'LKG', 'B', 'LKG-01', 'Active', NULL, NULL, '2026-08-13 22:23:27'),
(4, 4, 1, 'UKG', 'A', 'UKG-01', 'Active', NULL, NULL, '2026-08-13 22:23:27'),
(5, 5, 1, 'Grade 1', 'B', 'G1-01', 'Active', NULL, NULL, '2026-08-13 22:23:28'),
(6, 6, 1, 'Grade 2', 'A', 'G2-01', 'Active', NULL, NULL, '2026-08-13 22:23:28'),
(7, 7, 1, 'Grade 3', 'B', 'G3-01', 'Active', NULL, NULL, '2026-08-13 22:23:29'),
(8, 8, 1, 'Pre-KG', 'B', 'PreKG-02', 'Active', NULL, NULL, '2026-08-13 22:23:29'),
(9, 9, 1, 'LKG', 'A', 'LKG-02', 'Active', NULL, NULL, '2026-08-13 22:23:29'),
(10, 10, 1, 'UKG', 'A', 'UKG-02', 'Active', NULL, NULL, '2026-08-13 22:23:30'),
(11, 11, 1, 'Grade 1', 'A', 'G1-02', 'Active', NULL, NULL, '2026-08-13 22:23:30'),
(12, 12, 1, 'Grade 2', 'B', 'G2-02', 'Active', NULL, NULL, '2026-08-13 22:23:31'),
(13, 13, 1, 'Grade 3', 'B', 'G3-02', 'Active', NULL, NULL, '2026-08-13 22:23:31'),
(14, 14, 1, 'Pre-KG', 'A', 'PreKG-03', 'Active', NULL, NULL, '2026-08-13 22:23:32'),
(15, 15, 1, 'LKG', 'B', 'LKG-03', 'Active', NULL, NULL, '2026-08-13 22:23:32'),
(16, 16, 1, 'UKG', 'A', 'UKG-03', 'Active', NULL, NULL, '2026-08-13 22:23:33'),
(17, 17, 1, 'Grade 1', 'A', 'G1-03', 'Active', NULL, NULL, '2026-08-13 22:23:33'),
(18, 18, 1, 'Grade 2', 'A', 'G2-03', 'Active', NULL, NULL, '2026-08-13 22:23:33'),
(19, 19, 1, 'Grade 3', 'B', 'G3-03', 'Active', NULL, NULL, '2026-08-13 22:23:34'),
(20, 20, 1, 'Pre-KG', 'B', 'PreKG-04', 'Active', NULL, NULL, '2026-08-13 22:23:34'),
(21, 21, 1, 'LKG', 'A', 'LKG-04', 'Active', NULL, NULL, '2026-08-13 22:23:35'),
(22, 22, 1, 'UKG', 'A', 'UKG-04', 'Active', NULL, NULL, '2026-08-13 22:23:35'),
(23, 23, 1, 'Grade 1', 'B', 'G1-04', 'Active', NULL, NULL, '2026-08-13 22:23:36'),
(24, 24, 1, 'Grade 2', 'B', 'G2-04', 'Active', NULL, NULL, '2026-08-13 22:23:36'),
(25, 25, 1, 'Grade 3', 'B', 'G3-04', 'Active', NULL, NULL, '2026-08-13 22:23:36'),
(26, 26, 1, 'Pre-KG', 'A', 'PreKG-05', 'Active', NULL, NULL, '2026-08-13 22:23:37'),
(27, 27, 1, 'LKG', 'B', 'LKG-05', 'Active', NULL, NULL, '2026-08-13 22:23:37'),
(28, 28, 1, 'UKG', 'A', 'UKG-05', 'Active', NULL, NULL, '2026-08-13 22:23:38'),
(29, 29, 1, 'Grade 1', 'A', 'G1-05', 'Active', NULL, NULL, '2026-08-13 22:23:38'),
(30, 30, 1, 'Grade 2', 'A', 'G2-05', 'Active', NULL, NULL, '2026-08-13 22:23:39'),
(31, 31, 1, 'Grade 3', 'B', 'G3-05', 'Active', NULL, NULL, '2026-08-13 22:23:39'),
(32, 32, 1, 'Grade 1', 'A', '13265', 'Active', NULL, NULL, '2026-08-13 22:26:10');


-- ----------------------------
-- Table: student_exit_clearance
-- ----------------------------
DROP TABLE IF EXISTS `student_exit_clearance`;
CREATE TABLE `student_exit_clearance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `school_id` int NOT NULL,
  `fees_cleared` tinyint(1) NOT NULL DEFAULT '0',
  `fees_note` varchar(300) DEFAULT NULL,
  `library_cleared` tinyint(1) NOT NULL DEFAULT '0',
  `library_note` varchar(300) DEFAULT NULL,
  `transport_cleared` tinyint(1) NOT NULL DEFAULT '0',
  `transport_note` varchar(300) DEFAULT NULL,
  `books_returned` tinyint(1) NOT NULL DEFAULT '0',
  `books_note` varchar(300) DEFAULT NULL,
  `principal_approved` tinyint(1) NOT NULL DEFAULT '0',
  `principal_note` varchar(300) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_exit_student` (`student_id`),
  CONSTRAINT `student_exit_clearance_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `student_exit_clearance` (`id`, `student_id`, `school_id`, `fees_cleared`, `fees_note`, `library_cleared`, `library_note`, `transport_cleared`, `transport_note`, `books_returned`, `books_note`, `principal_approved`, `principal_note`, `created_at`, `updated_at`) VALUES
(1, 1, 3, 1, NULL, 1, NULL, 1, NULL, 1, NULL, 1, NULL, '2026-08-12 12:53:14', '2026-08-12 12:53:38');


-- ----------------------------
-- Table: student_kit_issues
-- ----------------------------
DROP TABLE IF EXISTS `student_kit_issues`;
CREATE TABLE `student_kit_issues` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `item_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `status` varchar(12) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Pending',
  `size` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `payment_status` varchar(10) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Unpaid',
  `issued_by` int DEFAULT NULL,
  `issued_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `academic_year_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_issue_year` (`student_id`,`item_id`,`academic_year_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `student_kit_issues_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `kit_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `student_kit_issues_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: student_transport
-- ----------------------------
DROP TABLE IF EXISTS `student_transport`;
CREATE TABLE `student_transport` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `student_id` int NOT NULL,
  `route_id` int DEFAULT NULL,
  `bus_id` int DEFAULT NULL,
  `stop_id` int DEFAULT NULL,
  `qr_code` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `rfid_tag` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Active',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `academic_year_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_student_transport` (`student_id`),
  KEY `route_id` (`route_id`),
  KEY `bus_id` (`bus_id`),
  KEY `stop_id` (`stop_id`),
  KEY `idx_st_school` (`school_id`),
  KEY `idx_acad_year` (`academic_year_id`),
  CONSTRAINT `student_transport_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `student_transport_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `student_transport_ibfk_3` FOREIGN KEY (`route_id`) REFERENCES `transport_routes` (`id`),
  CONSTRAINT `student_transport_ibfk_4` FOREIGN KEY (`bus_id`) REFERENCES `buses` (`id`),
  CONSTRAINT `student_transport_ibfk_5` FOREIGN KEY (`stop_id`) REFERENCES `route_stops` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: students
-- ----------------------------
DROP TABLE IF EXISTS `students`;
CREATE TABLE `students` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int DEFAULT NULL,
  `admission_id` int DEFAULT NULL,
  `roll_number` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `class` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `section` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `parent_name` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `parent_phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `parent_email` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `area` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Active',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `exit_type` varchar(40) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `exit_reason` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `exit_date` date DEFAULT NULL,
  `exit_notes` varchar(1000) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `archived` tinyint(1) NOT NULL DEFAULT '0',
  `archived_at` timestamp NULL DEFAULT NULL,
  `transfer_to` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `school_id` (`school_id`),
  KEY `admission_id` (`admission_id`),
  CONSTRAINT `students_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `students_ibfk_2` FOREIGN KEY (`admission_id`) REFERENCES `admissions` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `students` (`id`, `school_id`, `admission_id`, `roll_number`, `name`, `class`, `section`, `dob`, `parent_name`, `parent_phone`, `parent_email`, `area`, `status`, `created_at`, `updated_at`, `exit_type`, `exit_reason`, `exit_date`, `exit_notes`, `archived`, `archived_at`, `transfer_to`) VALUES
(1, 3, NULL, 'S-001', 'sarvesh', 'Grade 1', 'A', '2023-03-06 18:30:00', 'Kondababu', '9177446486', 'Kondababu@gmail.com', NULL, 'Active', '2026-08-13 21:24:39', '2026-08-13 21:24:39', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(2, 3, NULL, 'PreKG-01', 'Myra Verma', 'Pre-KG', 'B', '2023-08-16 18:30:00', 'Yash Verma', '9730699660', 'myra.verma25@gmail.com', 'MVP Colony', 'Active', '2026-08-13 21:31:16', '2026-08-13 21:31:16', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(3, 3, NULL, 'LKG-01', 'Aryan Verma', 'LKG', 'B', '2022-11-19 18:30:00', 'Aryan Verma', '9299902473', 'aryan.verma13@gmail.com', 'Seethammadhara', 'Active', '2026-08-13 21:31:16', '2026-08-13 21:31:16', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(4, 3, NULL, 'UKG-01', 'Rohan Sharma', 'UKG', 'A', '2021-09-25 18:30:00', 'Manav Sharma', '9844573897', 'rohan.sharma82@gmail.com', 'Gajuwaka', 'Active', '2026-08-13 21:31:16', '2026-08-13 21:31:16', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(5, 3, NULL, 'G1-01', 'Kavya Chowdary', 'Grade 1', 'B', '2020-11-23 18:30:00', 'Kavya Chowdary', '9798008398', 'kavya.chowdary21@gmail.com', 'Madhurawada', 'Active', '2026-08-13 21:31:17', '2026-08-13 21:31:17', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(6, 3, NULL, 'G2-01', 'Aarav Verma', 'Grade 2', 'A', '2019-01-01 18:30:00', 'Reyansh Verma', '9359784334', 'aarav.verma77@gmail.com', 'Gajuwaka', 'Active', '2026-08-13 21:31:17', '2026-08-13 21:31:17', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(7, 3, NULL, 'G3-01', 'Varun Gupta', 'Grade 3', 'B', '2018-08-18 18:30:00', 'Dev Gupta', '9309724730', 'varun.gupta67@gmail.com', 'MVP Colony', 'Active', '2026-08-13 21:31:17', '2026-08-13 21:31:17', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(8, 3, NULL, 'PreKG-02', 'Karthik Patel', 'Pre-KG', 'B', '2023-01-21 18:30:00', 'Aditya Patel', '9591054221', 'karthik.patel84@gmail.com', 'Dwaraka Nagar', 'Active', '2026-08-13 21:31:17', '2026-08-13 21:31:17', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(9, 3, NULL, 'LKG-02', 'Aadhya Verma', 'LKG', 'A', '2022-12-08 18:30:00', 'Ananya Verma', '9913885616', 'aadhya.verma30@gmail.com', 'Madhurawada', 'Active', '2026-08-13 21:31:18', '2026-08-13 21:31:18', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(10, 3, NULL, 'UKG-02', 'Rohan Reddy', 'UKG', 'A', '2021-10-24 18:30:00', 'Vihaan Reddy', '9529926020', 'rohan.reddy14@gmail.com', 'Dwaraka Nagar', 'Active', '2026-08-13 21:31:18', '2026-08-13 21:31:18', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(11, 3, NULL, 'G1-02', 'Saanvi Rao', 'Grade 1', 'A', '2020-10-31 18:30:00', 'Reyansh Rao', '9325182357', 'saanvi.rao7@gmail.com', 'Seethammadhara', 'Active', '2026-08-13 21:31:18', '2026-08-13 21:31:18', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(12, 3, NULL, 'G2-02', 'Saanvi Chowdary', 'Grade 2', 'B', '2019-02-18 18:30:00', 'Karthik Chowdary', '9313127159', 'saanvi.chowdary87@gmail.com', 'Dwaraka Nagar', 'Active', '2026-08-13 21:31:19', '2026-08-13 21:31:19', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(13, 3, NULL, 'G3-02', 'Ananya Rao', 'Grade 3', 'B', '2018-05-31 18:30:00', 'Aadhya Rao', '9913939801', 'ananya.rao16@gmail.com', 'MVP Colony', 'Active', '2026-08-13 21:31:19', '2026-08-13 21:31:19', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(14, 3, NULL, 'PreKG-03', 'Krishna Rao', 'Pre-KG', 'A', '2023-01-14 18:30:00', 'Aryan Rao', '9622722529', 'krishna.rao23@gmail.com', 'Pendurthi', 'Active', '2026-08-13 21:31:19', '2026-08-13 21:31:19', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(15, 3, NULL, 'LKG-03', 'Prisha Kumar', 'LKG', 'B', '2022-09-06 18:30:00', 'Nikhil Kumar', '9926267959', 'prisha.kumar17@gmail.com', 'Seethammadhara', 'Active', '2026-08-13 21:31:19', '2026-08-13 21:31:19', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(16, 3, NULL, 'UKG-03', 'Karthik Chowdary', 'UKG', 'A', '2021-07-13 18:30:00', 'Reyansh Chowdary', '9100505635', 'karthik.chowdary35@gmail.com', 'Madhurawada', 'Active', '2026-08-13 21:31:20', '2026-08-13 21:31:20', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(17, 3, NULL, 'G1-03', 'Rohan Reddy', 'Grade 1', 'A', '2020-03-12 18:30:00', 'Yash Reddy', '9746412435', 'rohan.reddy83@gmail.com', 'Madhurawada', 'Active', '2026-08-13 21:31:20', '2026-08-13 21:31:20', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(18, 3, NULL, 'G2-03', 'Vihaan Reddy', 'Grade 2', 'A', '2019-04-14 18:30:00', 'Ishaan Reddy', '9110281330', 'vihaan.reddy99@gmail.com', 'Madhurawada', 'Active', '2026-08-13 21:31:20', '2026-08-13 21:31:20', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(19, 3, NULL, 'G3-03', 'Ananya Patel', 'Grade 3', 'B', '2018-02-02 18:30:00', 'Aditya Patel', '9324125684', 'ananya.patel75@gmail.com', 'Pendurthi', 'Active', '2026-08-13 21:31:20', '2026-08-13 21:31:20', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(20, 3, NULL, 'PreKG-04', 'Krishna Reddy', 'Pre-KG', 'B', '2023-06-19 18:30:00', 'Myra Reddy', '9236602601', 'krishna.reddy76@gmail.com', 'Seethammadhara', 'Active', '2026-08-13 21:31:21', '2026-08-13 21:31:21', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(21, 3, NULL, 'LKG-04', 'Dev Iyer', 'LKG', 'A', '2022-07-05 18:30:00', 'Karthik Iyer', '9265501540', 'dev.iyer40@gmail.com', 'MVP Colony', 'Active', '2026-08-13 21:31:21', '2026-08-13 21:31:21', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(22, 3, NULL, 'UKG-04', 'Dev Iyer', 'UKG', 'A', '2021-12-06 18:30:00', 'Sai Iyer', '9893950892', 'dev.iyer81@gmail.com', 'Madhurawada', 'Active', '2026-08-13 21:31:21', '2026-08-13 21:31:21', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(23, 3, NULL, 'G1-04', 'Reyansh Chowdary', 'Grade 1', 'B', '2020-10-02 18:30:00', 'Aadhya Chowdary', '9150897049', 'reyansh.chowdary14@gmail.com', 'Gajuwaka', 'Active', '2026-08-13 21:31:21', '2026-08-13 21:31:21', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(24, 3, NULL, 'G2-04', 'Vivaan Verma', 'Grade 2', 'B', '2019-04-23 18:30:00', 'Rahul Verma', '9520489078', 'vivaan.verma33@gmail.com', 'Seethammadhara', 'Active', '2026-08-13 21:31:22', '2026-08-13 21:31:22', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(25, 3, NULL, 'G3-04', 'Dev Iyer', 'Grade 3', 'B', '2018-05-16 18:30:00', 'Sai Iyer', '9873473495', 'dev.iyer9@gmail.com', 'MVP Colony', 'Active', '2026-08-13 21:31:22', '2026-08-13 21:31:22', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(26, 3, NULL, 'PreKG-05', 'Krishna Gupta', 'Pre-KG', 'A', '2023-05-06 18:30:00', 'Kabir Gupta', '9319020650', 'krishna.gupta96@gmail.com', 'Gajuwaka', 'Active', '2026-08-13 21:31:23', '2026-08-13 21:31:23', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(27, 3, NULL, 'LKG-05', 'Aditya Patel', 'LKG', 'B', '2022-08-07 18:30:00', 'Vivaan Patel', '9150034369', 'aditya.patel23@gmail.com', 'Dwaraka Nagar', 'Active', '2026-08-13 21:31:23', '2026-08-13 21:31:23', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(28, 3, NULL, 'UKG-05', 'Diya Verma', 'UKG', 'A', '2021-02-11 18:30:00', 'Arjun Verma', '9583555057', 'diya.verma43@gmail.com', 'Pendurthi', 'Active', '2026-08-13 21:31:23', '2026-08-13 21:31:23', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(29, 3, NULL, 'G1-05', 'Nikhil Verma', 'Grade 1', 'A', '2020-10-01 18:30:00', 'Kabir Verma', '9119213748', 'nikhil.verma61@gmail.com', 'Dwaraka Nagar', 'Active', '2026-08-13 21:31:23', '2026-08-13 21:31:23', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(30, 3, NULL, 'G2-05', 'Rahul Patel', 'Grade 2', 'A', '2019-01-19 18:30:00', 'Karthik Patel', '9180352030', 'rahul.patel62@gmail.com', 'Gajuwaka', 'Active', '2026-08-13 21:31:24', '2026-08-13 21:31:24', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(31, 3, NULL, 'G3-05', 'Nikhil Patel', 'Grade 3', 'B', '2018-03-02 18:30:00', 'Aditya Patel', '9586502501', 'nikhil.patel70@gmail.com', 'Dwaraka Nagar', 'Active', '2026-08-13 21:31:24', '2026-08-13 21:31:24', NULL, NULL, NULL, NULL, 0, NULL, NULL),
(32, 3, NULL, '13265', 'mahesh', 'Grade 1', 'A', NULL, 'Kondababu', '9177446486', 'Kondababu@gmail.com', 'manikonda', 'Active', '2026-08-13 22:26:09', '2026-08-13 22:26:09', NULL, NULL, NULL, NULL, 0, NULL, NULL);


-- ----------------------------
-- Table: subjects
-- ----------------------------
DROP TABLE IF EXISTS `subjects`;
CREATE TABLE `subjects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `code` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `class_name` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `max_marks` int DEFAULT '100',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_subjects_school` (`school_id`),
  CONSTRAINT `subjects_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `subjects` (`id`, `school_id`, `name`, `code`, `class_name`, `max_marks`, `created_at`) VALUES
(1, 3, 'Maths', '1001', 'Grade 1', 100, '2026-08-14 03:36:04'),
(2, 3, 'English', '1002', 'Grade 1', 100, '2026-08-14 08:18:53');


-- ----------------------------
-- Table: super_admins
-- ----------------------------
DROP TABLE IF EXISTS `super_admins`;
CREATE TABLE `super_admins` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(200) COLLATE utf8mb4_general_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `last_login` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `super_admins` (`id`, `name`, `email`, `password_hash`, `is_active`, `last_login`, `created_at`) VALUES
(1, 'Super Admin', 'superadmin@enrolliq.com', '$2a$10$fxl4.JAU4h.AWFpWLOcsBe7r0VUUpufcio9QgkbtTU9yRkd65IQ9i', 1, '2026-08-15 12:38:39', '2026-06-06 06:14:20');


-- ----------------------------
-- Table: teacher_assignments
-- ----------------------------
DROP TABLE IF EXISTS `teacher_assignments`;
CREATE TABLE `teacher_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `class` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `section` varchar(5) COLLATE utf8mb4_general_ci NOT NULL,
  `subject` varchar(40) COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_assignment` (`user_id`,`class`,`section`,`subject`),
  CONSTRAINT `teacher_assignments_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: transport_attendance
-- ----------------------------
DROP TABLE IF EXISTS `transport_attendance`;
CREATE TABLE `transport_attendance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `student_id` int NOT NULL,
  `bus_id` int DEFAULT NULL,
  `route_id` int DEFAULT NULL,
  `driver_id` int DEFAULT NULL,
  `scan_type` varchar(10) COLLATE utf8mb4_general_ci DEFAULT 'QR',
  `trip_type` varchar(10) COLLATE utf8mb4_general_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Boarded',
  `scanned_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `notified` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `academic_year_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `bus_id` (`bus_id`),
  KEY `driver_id` (`driver_id`),
  KEY `idx_ta_school` (`school_id`),
  KEY `idx_ta_student` (`student_id`),
  KEY `idx_ta_date` (`scanned_at`),
  KEY `idx_acad_year` (`academic_year_id`),
  CONSTRAINT `transport_attendance_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `transport_attendance_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`),
  CONSTRAINT `transport_attendance_ibfk_3` FOREIGN KEY (`bus_id`) REFERENCES `buses` (`id`),
  CONSTRAINT `transport_attendance_ibfk_4` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: transport_notifications
-- ----------------------------
DROP TABLE IF EXISTS `transport_notifications`;
CREATE TABLE `transport_notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `student_id` int NOT NULL,
  `attendance_id` int DEFAULT NULL,
  `parent_phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `message` text COLLATE utf8mb4_general_ci NOT NULL,
  `channel` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'WhatsApp',
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Sent',
  `sent_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tn_school` (`school_id`),
  KEY `idx_tn_student` (`student_id`),
  CONSTRAINT `transport_notifications_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `transport_notifications_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: transport_routes
-- ----------------------------
DROP TABLE IF EXISTS `transport_routes`;
CREATE TABLE `transport_routes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `route_name` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `bus_id` int DEFAULT NULL,
  `driver_id` int DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `route_type` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Both',
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Active',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `bus_id` (`bus_id`),
  KEY `driver_id` (`driver_id`),
  KEY `idx_routes_school` (`school_id`),
  CONSTRAINT `transport_routes_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `transport_routes_ibfk_2` FOREIGN KEY (`bus_id`) REFERENCES `buses` (`id`),
  CONSTRAINT `transport_routes_ibfk_3` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: user_sessions
-- ----------------------------
DROP TABLE IF EXISTS `user_sessions`;
CREATE TABLE `user_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `token_hash` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `user_sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ----------------------------
-- Table: users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int DEFAULT NULL,
  `name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `subject` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `joining_date` date DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `role` varchar(30) COLLATE utf8mb4_general_ci DEFAULT 'admin',
  `is_active` tinyint(1) DEFAULT '1',
  `last_login` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `employee_id` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `photo_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `gender` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `blood_group` varchar(5) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `date_of_joining` date DEFAULT NULL,
  `employment_type` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Full-time',
  `department` varchar(40) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `designation` varchar(80) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `reporting_to` int DEFAULT NULL,
  `qualification` varchar(120) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `experience_years` decimal(4,1) DEFAULT NULL,
  `previous_school` varchar(120) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `class_teacher_of` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_general_ci,
  `emergency_contact_name` varchar(80) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `emergency_contact_phone` varchar(15) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `aadhaar_number` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `pan_number` varchar(15) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `police_verification` varchar(20) COLLATE utf8mb4_general_ci DEFAULT 'Pending',
  `bank_account` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `bank_ifsc` varchar(15) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `pf_uan` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `esi_number` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `must_change_password` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_employee_id` (`employee_id`),
  KEY `school_id` (`school_id`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `users` (`id`, `school_id`, `name`, `email`, `phone`, `subject`, `joining_date`, `status`, `password_hash`, `role`, `is_active`, `last_login`, `created_at`, `updated_at`, `employee_id`, `photo_url`, `gender`, `dob`, `blood_group`, `date_of_joining`, `employment_type`, `department`, `designation`, `reporting_to`, `qualification`, `experience_years`, `previous_school`, `class_teacher_of`, `address`, `emergency_contact_name`, `emergency_contact_phone`, `aadhaar_number`, `pan_number`, `police_verification`, `bank_account`, `bank_ifsc`, `pf_uan`, `esi_number`, `must_change_password`) VALUES
(1, 2, 'sarvesh', 'sarvesh@gmail.com', NULL, NULL, NULL, NULL, '$2a$10$6lgp/D8J.ABiS6HAkQpMw.ZdKylVbT3iOuiWV92sybh.v/uliYrY.', 'admin', 1, '2026-07-23 05:23:23', '2026-06-06 06:40:26', '2026-07-27 04:09:18', 'EMP-001', NULL, NULL, NULL, NULL, NULL, 'Full-time', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Pending', NULL, NULL, NULL, NULL, 0),
(2, 3, 'Krishna ', 'krishna@gmail.com', NULL, NULL, NULL, NULL, '$2a$10$XQ.s4fDqQckPBLnesYPK.uGv5UngObEMUsITSFmLfarcXiGbbnl9K', 'admin', 1, '2026-08-15 11:15:33', '2026-06-22 08:59:17', '2026-08-15 11:15:33', 'EMP-002', NULL, NULL, NULL, NULL, NULL, 'Full-time', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Pending', NULL, NULL, NULL, NULL, 0),
(3, 3, 'sam', 'sam@gmail.com', '9876543210', NULL, NULL, NULL, '$2a$10$mlp9Oxx3twvOMW4AFTth/e.o6fkDf4Jy.9agEe.BnnR0OZI0Y5hQC', 'staff', 1, '2026-07-18 14:21:55', '2026-06-24 08:38:16', '2026-07-27 04:09:18', 'EMP-003', NULL, NULL, NULL, NULL, NULL, 'Full-time', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Pending', NULL, NULL, NULL, NULL, 0),
(4, 3, 'sai', 'sai@gmail.com', '9876543210', NULL, NULL, NULL, '$2a$10$VHj4ZjMZnC6xuufL53hVvuS8nUW6JvSiyaatuQ1dRugj6onttVxTy', 'teacher', 1, '2026-08-15 09:32:58', '2026-06-24 08:44:26', '2026-08-15 09:32:58', 'TCH-004', NULL, NULL, NULL, NULL, NULL, 'Full-time', NULL, NULL, NULL, NULL, NULL, NULL, 'Grade 10|C', NULL, NULL, NULL, NULL, NULL, 'Pending', NULL, NULL, NULL, NULL, 0),
(5, 3, 'ram', 'ram@gmail.com', '9876543210', NULL, NULL, NULL, '$2a$10$l2fyUk.19Zqwig.MEo8meeSZqClHz/gxVDYjc..LaYRgMGkSCMZwy', 'accountant', 1, '2026-07-18 14:22:25', '2026-06-24 08:45:48', '2026-07-27 04:09:18', 'EMP-005', NULL, NULL, NULL, NULL, NULL, 'Full-time', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Pending', NULL, NULL, NULL, NULL, 0),
(6, 3, 'pavan', 'pavan@gmail.com', '9876543210', NULL, NULL, NULL, '$2a$10$wAKnUjpSsc1yZsMSBklJhO0X/Pm9Jf7ikH3.x4A1D2i.oCTiwfvdK', 'receptionist', 1, '2026-08-15 09:32:41', '2026-06-24 08:48:24', '2026-08-15 09:32:41', 'EMP-006', NULL, NULL, NULL, NULL, NULL, 'Full-time', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Pending', NULL, NULL, NULL, NULL, 0),
(7, 3, 'sairam', 'sairam@gmail.com', '9876543210', NULL, NULL, NULL, '$2a$10$uO3kKnRS41nRNal1f7cDBuOXTVE3VNVe/LUhx6sivnEcU3VxWIkfO', 'transport_manager', 1, '2026-07-18 14:22:44', '2026-06-24 08:50:05', '2026-07-27 04:09:18', 'EMP-007', NULL, 'Male', NULL, 'AB+', '2026-07-05 18:30:00', 'Full-time', 'Transport', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Pending', NULL, NULL, NULL, NULL, 0),
(8, 3, 'karthik', 'karthi@gmail.com', '7894561230', NULL, NULL, NULL, '$2a$10$FpKRa/vVp1qFzSFBAL7lBukkGk2aZrv26g69lrtYwucIbryCfouTG', 'teacher', 1, '2026-08-11 23:18:36', '2026-07-27 02:57:42', '2026-08-11 23:18:36', '123456789', NULL, NULL, NULL, NULL, '2026-07-24 18:30:00', 'Full-time', 'Academic', 'Maths', NULL, NULL, NULL, NULL, 'UKG|A', NULL, NULL, NULL, NULL, NULL, 'Pending', NULL, NULL, NULL, NULL, 0),
(9, 3, 'Sarvesh Tokala', 'sarvesh123456@gmail.com', '9177447642', NULL, NULL, NULL, '$2a$10$/YdCSagANMI6QDzsXTzfZ.Ys.Ye5mUJXD/bZ20RwmGWjtLficJxqO', 'staff', 1, '2026-08-11 23:21:34', '2026-07-27 13:47:51', '2026-08-11 23:21:34', 'EMP-008', NULL, 'Male', '2002-02-12 18:30:00', 'O-', '2026-07-13 18:30:00', 'Full-time', 'Academic', NULL, 2, 'M tech', '5.0', NULL, NULL, 'kondapur opposite of RTo office', 'Sarvesh Tokala', '9177447648', '789445611230', NULL, 'Submitted', '2025468789431', 'SBIN000RKM', NULL, NULL, 0),
(10, 2, 'Sarvesh Tokala', 'sarveshthokala143@gmail.com', '9390683569', NULL, NULL, NULL, '$2a$10$4VCrN6UPSAZoJft7HHf38.1pDOjjJa/2Q8oKKoa7uwnjVxtEqjmNy', 'transport_manager', 1, '2026-08-04 19:05:02', '2026-08-04 19:00:39', '2026-08-04 19:05:02', '1231658', NULL, 'Male', '2002-02-04 18:30:00', 'O-', '2026-08-04 18:30:00', 'Full-time', 'Transport', 'Transportation Manager', 1, 'B texh', '5.0', 'none', NULL, 'main road medivada', 'Govi', '8886761888', '532490583355', NULL, 'Submitted', NULL, NULL, NULL, NULL, 0);


SET FOREIGN_KEY_CHECKS=1;
