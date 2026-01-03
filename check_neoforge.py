import requests
import json

url = "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge"
try:
    response = requests.get(url)
    data = response.json()
    versions = data.get("versions", [])
    
    print("Total versions:", len(versions))
    
    v20 = [v for v in versions if v.startswith("20.")]
    print("Versions starting with 20.:", v20[:20])
    
    # Check for 1.20
    v1_20 = [v for v in versions if v.startswith("1.20")]
    print("Versions starting with 1.20:", v1_20[:20])

except Exception as e:
    print("Error:", e)
