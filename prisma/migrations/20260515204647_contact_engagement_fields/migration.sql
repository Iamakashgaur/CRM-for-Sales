-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contactId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "loggedBy" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "altPhone" TEXT,
    "company" TEXT,
    "title" TEXT,
    "source" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "linkedinUrl" TEXT,
    "website" TEXT,
    "ownerId" TEXT NOT NULL,
    "dnc" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "callStatus" TEXT,
    "followUpStatus" TEXT,
    "lastContactDate" DATETIME,
    "nextFollowUpDate" DATETIME,
    "nextFollowUpTime" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Contact" ("company", "createdAt", "email", "id", "linkedinUrl", "name", "notes", "ownerId", "phone", "source", "tags", "title", "updatedAt", "website") SELECT "company", "createdAt", "email", "id", "linkedinUrl", "name", "notes", "ownerId", "phone", "source", "tags", "title", "updatedAt", "website" FROM "Contact";
DROP TABLE "Contact";
ALTER TABLE "new_Contact" RENAME TO "Contact";
CREATE INDEX "Contact_ownerId_idx" ON "Contact"("ownerId");
CREATE INDEX "Contact_email_idx" ON "Contact"("email");
CREATE INDEX "Contact_company_idx" ON "Contact"("company");
CREATE INDEX "Contact_category_idx" ON "Contact"("category");
CREATE INDEX "Contact_nextFollowUpDate_idx" ON "Contact"("nextFollowUpDate");
CREATE UNIQUE INDEX "Contact_ownerId_email_key" ON "Contact"("ownerId", "email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CallLog_contactId_idx" ON "CallLog"("contactId");

-- CreateIndex
CREATE INDEX "CallLog_at_idx" ON "CallLog"("at");
