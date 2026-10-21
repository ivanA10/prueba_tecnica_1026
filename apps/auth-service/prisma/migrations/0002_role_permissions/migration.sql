-- AlterTable
ALTER TABLE "role_names_projection" ADD COLUMN "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];
