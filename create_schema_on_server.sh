#!/bin/bash
cd /opt/supabase-project/supabase/docker
source .env
docker exec -e PGPASSWORD=$POSTGRES_PASSWORD supabase-db psql -U postgres -h localhost -c 'CREATE SCHEMA IF NOT EXISTS auth;'
echo "Схема auth создана"

