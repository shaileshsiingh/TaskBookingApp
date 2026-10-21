-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "startOtp" TEXT;

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "available" BOOLEAN NOT NULL DEFAULT true;
