ALTER TABLE "Assignment"
ADD COLUMN "customerConfirmedAt" TIMESTAMP(3);

CREATE TABLE "ProviderReview" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderReview_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProviderReview_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5)
);

CREATE UNIQUE INDEX "ProviderReview_assignmentId_key"
ON "ProviderReview"("assignmentId");

CREATE INDEX "ProviderReview_providerId_createdAt_idx"
ON "ProviderReview"("providerId", "createdAt");

CREATE INDEX "ProviderReview_customerId_createdAt_idx"
ON "ProviderReview"("customerId", "createdAt");

ALTER TABLE "ProviderReview"
ADD CONSTRAINT "ProviderReview_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProviderReview"
ADD CONSTRAINT "ProviderReview_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderReview"
ADD CONSTRAINT "ProviderReview_providerId_fkey"
FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
