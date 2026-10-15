-- Existing historical rows are retained. Guards apply only to new allocations or changes.
CREATE TRIGGER ops_rotation_no_overlap_insert BEFORE INSERT ON OpsRotationAssignment
WHEN EXISTS (SELECT 1 FROM OpsRotationAssignment a
 WHERE a.rotationPlanId = NEW.rotationPlanId
 AND (a.employeeId = NEW.employeeId OR a.operationalPositionId = NEW.operationalPositionId)
 AND a.startTime < NEW.endTime AND a.endTime > NEW.startTime)
BEGIN SELECT RAISE(ABORT, 'Rotation employee or position overlaps an existing allocation'); END;

CREATE TRIGGER ops_rotation_no_overlap_update BEFORE UPDATE OF rotationPlanId, employeeId, operationalPositionId, startTime, endTime ON OpsRotationAssignment
WHEN EXISTS (SELECT 1 FROM OpsRotationAssignment a
 WHERE a.id <> NEW.id AND a.rotationPlanId = NEW.rotationPlanId
 AND (a.employeeId = NEW.employeeId OR a.operationalPositionId = NEW.operationalPositionId)
 AND a.startTime < NEW.endTime AND a.endTime > NEW.startTime)
BEGIN SELECT RAISE(ABORT, 'Rotation employee or position overlaps an existing allocation'); END;

CREATE TRIGGER ops_trip_no_duplicate_insert BEFORE INSERT ON OpsDailyTrip
WHEN NEW.status <> 'CANCELLED' AND EXISTS (SELECT 1 FROM OpsDailyTrip t
 WHERE t.branch = NEW.branch AND t.workDate = NEW.workDate AND t.startTime = NEW.startTime
 AND lower(trim(t.name)) = lower(trim(NEW.name)) AND t.status <> 'CANCELLED')
BEGIN SELECT RAISE(ABORT, 'Trip already exists for the same branch, date and start time'); END;

CREATE TRIGGER ops_trip_no_duplicate_update BEFORE UPDATE OF branch, workDate, startTime, name, status ON OpsDailyTrip
WHEN NEW.status <> 'CANCELLED' AND EXISTS (SELECT 1 FROM OpsDailyTrip t
 WHERE t.id <> NEW.id AND t.branch = NEW.branch AND t.workDate = NEW.workDate AND t.startTime = NEW.startTime
 AND lower(trim(t.name)) = lower(trim(NEW.name)) AND t.status <> 'CANCELLED')
BEGIN SELECT RAISE(ABORT, 'Trip already exists for the same branch, date and start time'); END;
