-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancellationFeePaise" INTEGER,
ADD COLUMN     "cancelledAt" TIMESTAMP(3);
