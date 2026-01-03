import requests
import xml.etree.ElementTree as ET

url = "https://maven.neoforged.net/releases/net/neoforged/forge/maven-metadata.xml"
try:
    response = requests.get(url)
    root = ET.fromstring(response.content)
    
    versions = []
    for version in root.findall(".//version"):
        versions.append(version.text)
        
    print("Total versions from XML:", len(versions))
    
    v20 = [v for v in versions if v.startswith("20.")]
    print("Versions starting with 20.:", v20[:20])
    
    v1_20 = [v for v in versions if v.startswith("1.20")]
    print("Versions starting with 1.20:", v1_20[:20])

except Exception as e:
    print("Error:", e)
