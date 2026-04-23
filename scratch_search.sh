#!/bin/bash
QUERIES=("Champions League" "Europa League" "Conference League" "Premier League" "LaLiga" "Serie A" "Bundesliga" "Ligue 1" "Eredivisie" "Liga Portugal" "Championship" "Super Lig" "Jupiler Pro League" "Scottish Premiership" "2. Bundesliga" "LaLiga 2" "Serie B" "Ligue 2" "Czech First League" "Fortuna Liga" "Austrian Bundesliga" "Swiss Super League" "Allsvenskan" "Eliteserien" "Superliga" "FA Cup" "Copa del Rey" "Coppa Italia" "DFB Pokal" "Coupe de France" "Puchar Polski" "KNVB Beker" "Taca de Portugal" "Copa Libertadores" "Copa Sudamericana" "Saudi Pro League" "MLS" "Brasileirao" "Liga MX" "Ekstraklasa")

for q in "${QUERIES[@]}"; do
    curl -s --request GET \
        --url "https://sportapi7.p.rapidapi.com/api/v1/search/all?q=$(echo $q | sed 's/ /%20/g')" \
        --header 'x-rapidapi-host: sportapi7.p.rapidapi.com' \
        --header 'x-rapidapi-key: 4052fc9297msh7fb3d17f79defbap15184bjsnc765d77c4026' | \
        jq -r --arg q "$q" '.results[]? | select(.type == "uniqueTournament") | .entity | "\(.id) # \($q) (\(.name))"' | head -n 1
    sleep 0.5
done
