for i in {1..15}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/login/)
  if [ "$STATUS" = "200" ]; then
    echo "App is up!"
    exit 0
  fi
  echo "Waiting for app... HTTP $STATUS ($i/15)"
  sleep 3
done
echo "Timed out waiting for app"
exit 1
