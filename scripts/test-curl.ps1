$config = Get-Content -Raw -Path "./config.json" | ConvertFrom-Json
$port = $config.port
$base = "http://localhost:$port/api"
$loginBody = "username=admin&password=picmi"
$cookieJar = Join-Path $PSScriptRoot "curl-cookies.txt"

curl.exe -s -o NUL -w "auth_init %{http_code} %{time_total}`n" -X POST "$base/auth/init" -d $loginBody
curl.exe -s -o NUL -w "login %{http_code} %{time_total}`n" -c $cookieJar -b $cookieJar -X POST "$base/login" -d $loginBody
curl.exe -s -o NUL -w "users %{http_code} %{time_total}`n" -b $cookieJar "$base/users"
curl.exe -s -o NUL -w "images_list %{http_code} %{time_total}`n" -b $cookieJar "$base/images/list?path=/"
