CREATE TABLE "ProviderSkill" (
    "providerProfileId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "ProviderSkill_pkey" PRIMARY KEY ("providerProfileId", "serviceId")
);

CREATE INDEX "ProviderSkill_serviceId_idx" ON "ProviderSkill"("serviceId");

ALTER TABLE "ProviderSkill"
ADD CONSTRAINT "ProviderSkill_providerProfileId_fkey"
FOREIGN KEY ("providerProfileId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProviderSkill"
ADD CONSTRAINT "ProviderSkill_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
