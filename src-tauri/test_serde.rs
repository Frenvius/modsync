fn main() {
    let json = r#"{"ModID":"usefulscrap","Name":"Useful Scraps","Version":"2.0.2","Type":1,"Authors":["Mr1k3"],"Side":"Universal","Dependencies":{}}"#;
    
    #[derive(serde::Deserialize, Debug)]
    struct Test {
        #[serde(default, alias = "modid", alias = "modId", alias = "ModId", alias = "ModID")]
        modid: Option<String>,
        #[serde(default, alias = "Name")]
        name: Option<String>,
    }
    
    let result: Result<Test, _> = serde_json::from_str(json);
    println!("{:?}", result);
}
