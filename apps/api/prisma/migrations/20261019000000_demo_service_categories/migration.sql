INSERT INTO "Category" ("id", "name", "active")
VALUES
    ('home-support', 'Home support', true),
    ('moving-support', 'Moving assistance', true),
    ('event-support', 'Event support', true);

UPDATE "Service"
SET "categoryId" = 'home-support'
WHERE "id" = 'home-help';

UPDATE "Service"
SET "categoryId" = 'moving-support'
WHERE "id" = 'moving-help';

UPDATE "Service"
SET "categoryId" = 'event-support'
WHERE "id" = 'event-crew';

DELETE FROM "Category"
WHERE "id" = 'general-services'
  AND NOT EXISTS (
    SELECT 1 FROM "Service"
    WHERE "Service"."categoryId" = "Category"."id"
  );
