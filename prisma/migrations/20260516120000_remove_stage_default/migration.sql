-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Stage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "probability" INTEGER NOT NULL DEFAULT 50
);
INSERT INTO "new_Stage" ("id","name","order","color","probability") SELECT "id","name","order","color","probability" FROM "Stage";
DROP TABLE "Stage";
ALTER TABLE "new_Stage" RENAME TO "Stage";
CREATE UNIQUE INDEX "Stage_name_key" ON "Stage"("name");
CREATE UNIQUE INDEX "Stage_order_key" ON "Stage"("order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
