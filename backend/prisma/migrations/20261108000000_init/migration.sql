-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `tier` ENUM('FREE', 'PLUS', 'PREMIUM') NOT NULL DEFAULT 'FREE',
    `stripeCustomerId` VARCHAR(255) NULL,
    `stripeSubscriptionId` VARCHAR(255) NULL,
    `subscriptionStatus` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `profiles_userId_key`(`userId`),
    UNIQUE INDEX `profiles_stripeCustomerId_key`(`stripeCustomerId`),
    UNIQUE INDEX `profiles_stripeSubscriptionId_key`(`stripeSubscriptionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leagues` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `apiId` VARCHAR(100) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `country` VARCHAR(100) NULL,

    UNIQUE INDEX `leagues_apiId_key`(`apiId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teams` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `apiId` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `logoUrl` VARCHAR(500) NULL,

    UNIQUE INDEX `teams_apiId_key`(`apiId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `live_matches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `apiId` INTEGER NOT NULL,
    `leagueId` INTEGER NULL,
    `homeTeamId` INTEGER NULL,
    `awayTeamId` INTEGER NULL,
    `countryName` VARCHAR(100) NULL,
    `homeScore` INTEGER NOT NULL DEFAULT 0,
    `awayScore` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(50) NOT NULL,
    `minute` INTEGER NOT NULL DEFAULT 0,
    `matchTime` VARCHAR(20) NULL,
    `homeFormation` VARCHAR(20) NULL,
    `awayFormation` VARCHAR(20) NULL,
    `statsJson` JSON NULL,
    `matchDate` DATE NULL,
    `startDatetime` DATETIME(3) NULL,
    `isTop` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,
    `notifiedEventIds` JSON NOT NULL,
    `lastNotifiedScore` VARCHAR(10) NOT NULL DEFAULT '0:0',
    `hasIncidentData` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `live_matches_apiId_key`(`apiId`),
    INDEX `live_matches_status_idx`(`status`),
    INDEX `live_matches_homeTeamId_matchDate_idx`(`homeTeamId`, `matchDate`),
    INDEX `live_matches_awayTeamId_matchDate_idx`(`awayTeamId`, `matchDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `upcoming_matches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `apiId` INTEGER NOT NULL,
    `homeTeamId` INTEGER NULL,
    `awayTeamId` INTEGER NULL,
    `leagueId` INTEGER NULL,
    `startDatetime` DATETIME(3) NULL,
    `isTop` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `upcoming_matches_apiId_key`(`apiId`),
    INDEX `upcoming_matches_startDatetime_idx`(`startDatetime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `match_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `matchId` INTEGER NOT NULL,
    `incidentType` VARCHAR(50) NOT NULL,
    `eventId` VARCHAR(100) NOT NULL,
    `time` INTEGER NOT NULL DEFAULT 0,
    `addedTime` INTEGER NOT NULL DEFAULT 0,
    `isHome` BOOLEAN NOT NULL DEFAULT true,
    `playerName` VARCHAR(100) NULL,
    `assistPlayerName` VARCHAR(100) NULL,
    `assist2PlayerName` VARCHAR(100) NULL,
    `homeScore` INTEGER NULL,
    `awayScore` INTEGER NULL,
    `incidentClass` VARCHAR(50) NULL,
    `reason` VARCHAR(255) NULL,
    `rescinded` BOOLEAN NOT NULL DEFAULT false,
    `playerInName` VARCHAR(100) NULL,
    `playerOutName` VARCHAR(100) NULL,
    `injury` BOOLEAN NOT NULL DEFAULT false,
    `text` VARCHAR(100) NULL,
    `isLive` BOOLEAN NOT NULL DEFAULT false,
    `injuryTimeLength` INTEGER NULL,
    `confirmed` BOOLEAN NULL,

    INDEX `match_events_matchId_time_idx`(`matchId`, `time`),
    UNIQUE INDEX `match_events_matchId_eventId_key`(`matchId`, `eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `match_lineups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `matchId` INTEGER NOT NULL,
    `playerName` VARCHAR(100) NOT NULL,
    `playerApiId` INTEGER NULL,
    `shirtNumber` INTEGER NULL,
    `position` VARCHAR(50) NULL,
    `isHomeTeam` BOOLEAN NOT NULL DEFAULT true,
    `isStartingXi` BOOLEAN NOT NULL DEFAULT true,
    `isCaptain` BOOLEAN NOT NULL DEFAULT false,
    `avgRating` VARCHAR(10) NULL,

    UNIQUE INDEX `match_lineups_matchId_playerName_isHomeTeam_key`(`matchId`, `playerName`, `isHomeTeam`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `missing_players` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `matchId` INTEGER NOT NULL,
    `playerName` VARCHAR(100) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `reason` VARCHAR(255) NULL,
    `isHomeTeam` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `missing_players_matchId_playerName_isHomeTeam_key`(`matchId`, `playerName`, `isHomeTeam`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `match_subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `matchId` INTEGER NOT NULL,
    `userId` INTEGER NULL,
    `sessionKey` VARCHAR(100) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `match_subscriptions_matchId_isActive_idx`(`matchId`, `isActive`),
    UNIQUE INDEX `match_subscriptions_sessionKey_matchId_key`(`sessionKey`, `matchId`),
    UNIQUE INDEX `match_subscriptions_userId_matchId_key`(`userId`, `matchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `favorite_teams` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `teamId` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `favorite_teams_teamId_isActive_idx`(`teamId`, `isActive`),
    UNIQUE INDEX `favorite_teams_userId_teamId_key`(`userId`, `teamId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `players` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `apiId` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `firstName` VARCHAR(100) NULL,
    `lastName` VARCHAR(100) NULL,
    `teamId` INTEGER NULL,
    `position` VARCHAR(50) NULL,
    `jerseyNumber` INTEGER NULL,
    `nationality` VARCHAR(50) NULL,
    `dateOfBirth` DATE NULL,
    `height` INTEGER NULL,
    `weight` INTEGER NULL,
    `imageUrl` VARCHAR(500) NULL,
    `preferredFoot` VARCHAR(50) NULL,
    `marketValue` BIGINT NULL,
    `contractUntil` DATE NULL,
    `retired` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `players_apiId_key`(`apiId`),
    INDEX `players_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `league_standings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `leagueId` INTEGER NOT NULL,
    `teamId` INTEGER NOT NULL,
    `position` INTEGER NOT NULL,
    `points` INTEGER NOT NULL,
    `matchesPlayed` INTEGER NOT NULL,
    `matchesWon` INTEGER NOT NULL,
    `matchesDrawn` INTEGER NOT NULL,
    `matchesLost` INTEGER NOT NULL,
    `goalsFor` INTEGER NOT NULL,
    `goalsAgainst` INTEGER NOT NULL,
    `goalDifference` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `league_standings_leagueId_position_idx`(`leagueId`, `position`),
    UNIQUE INDEX `league_standings_leagueId_teamId_key`(`leagueId`, `teamId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cached_images` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entityType` VARCHAR(20) NOT NULL,
    `apiId` INTEGER NOT NULL,
    `content` LONGBLOB NOT NULL,
    `contentType` VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `cached_images_entityType_apiId_key`(`entityType`, `apiId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `push_subscriptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `endpoint` VARCHAR(500) NOT NULL,
    `p256dh` VARCHAR(255) NOT NULL,
    `auth` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `push_subscriptions_endpoint_key`(`endpoint`),
    INDEX `push_subscriptions_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stripe_events` (
    `id` VARCHAR(255) NOT NULL,
    `type` VARCHAR(100) NOT NULL,
    `processedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `profiles` ADD CONSTRAINT `profiles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `live_matches` ADD CONSTRAINT `live_matches_leagueId_fkey` FOREIGN KEY (`leagueId`) REFERENCES `leagues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `live_matches` ADD CONSTRAINT `live_matches_homeTeamId_fkey` FOREIGN KEY (`homeTeamId`) REFERENCES `teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `live_matches` ADD CONSTRAINT `live_matches_awayTeamId_fkey` FOREIGN KEY (`awayTeamId`) REFERENCES `teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `upcoming_matches` ADD CONSTRAINT `upcoming_matches_leagueId_fkey` FOREIGN KEY (`leagueId`) REFERENCES `leagues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `upcoming_matches` ADD CONSTRAINT `upcoming_matches_homeTeamId_fkey` FOREIGN KEY (`homeTeamId`) REFERENCES `teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `upcoming_matches` ADD CONSTRAINT `upcoming_matches_awayTeamId_fkey` FOREIGN KEY (`awayTeamId`) REFERENCES `teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `match_events` ADD CONSTRAINT `match_events_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `live_matches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `match_lineups` ADD CONSTRAINT `match_lineups_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `live_matches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `missing_players` ADD CONSTRAINT `missing_players_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `live_matches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `match_subscriptions` ADD CONSTRAINT `match_subscriptions_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `live_matches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `match_subscriptions` ADD CONSTRAINT `match_subscriptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorite_teams` ADD CONSTRAINT `favorite_teams_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorite_teams` ADD CONSTRAINT `favorite_teams_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `players` ADD CONSTRAINT `players_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `league_standings` ADD CONSTRAINT `league_standings_leagueId_fkey` FOREIGN KEY (`leagueId`) REFERENCES `leagues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `league_standings` ADD CONSTRAINT `league_standings_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

