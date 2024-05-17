import {
    OpenAI,
    FunctionTool,
    OpenAIAgent,
    Settings,
    LlamaParseReader,
    HuggingFaceEmbedding,
    VectorStoreIndex,
    QueryEngineTool,
    QdrantVectorStore
} from "llamaindex"
import 'dotenv/config'
import fs from "node:fs/promises"

async function main() {

    const PARSING_CACHE = "./cache.json"

    // set LLM and the embedding model
    Settings.llm = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: "gpt-4o",
    })
    Settings.embedModel = new HuggingFaceEmbedding({
        modelType: "BAAI/bge-small-en-v1.5",
        quantized: false
    })
    /*
    Set up logging so we can see the work in progress.
    Available events:
    llm-start
    llm-end
    agent-start
    agent-end
    llm-tool-call
    llm-tool-result
    */
    Settings.callbackManager.on("llm-tool-call", (event) => {
        console.log(event.detail.payload)
    })
    Settings.callbackManager.on("llm-tool-result", (event) => {
        console.log(event.detail.payload)
    })

    // initialize qdrant vector store
    const vectorStore = new QdrantVectorStore({
        url: "http://localhost:6333",
    });

    // load cache.json and parse it
    let cache = {}
    let cacheExists = false
    try {
        await fs.access(PARSING_CACHE, fs.constants.F_OK)
        cacheExists = true
    } catch (e) {
        console.log("No cache found")
    }
    if (cacheExists) {
        cache = JSON.parse(await fs.readFile(PARSING_CACHE, "utf-8"))
    }

    const filesToParse = [
        "../data/sf_budget_2023_2024.pdf"
    ]

    // load our data, reading only files we haven't seen before
    let documents = []
    const reader = new LlamaParseReader({ resultType: "markdown" });
    for (let file of filesToParse) {
        if (!cache[file]) {
            documents = documents.concat(await reader.loadData(file))
            cache[file] = true
        }
    }

    // write the cache back to disk
    await fs.writeFile(PARSING_CACHE, JSON.stringify(cache))

    // create a query engine from our documents
    const index = await VectorStoreIndex.fromDocuments(
        documents,
        {vectorStore}
    )
    const retriever = await index.asRetriever()
    retriever.similarityTopK = 10
    const queryEngine = await index.asQueryEngine({
        retriever
    })

    // define a function to sum up numbers
    const sumNumbers = ({ a, b }) => {
        return `${a + b}`;
    }

    // define the query engine as a tool
    const tools = [
        new QueryEngineTool({
            queryEngine: queryEngine,
            metadata: {
                name: "san_francisco_budget_tool",
                description: `This tool can answer detailed questions about the individual components of the budget of San Francisco in 2023-2024.`,
            },
        }),
        FunctionTool.from(
            sumNumbers,
            {
                name: "sumNumbers",
                description: "Use this function to sum two numbers",
                parameters: {
                    type: "object",
                    properties: {
                        a: {
                            type: "number",
                            description: "First number to sum"
                        },
                        b: {
                            type: "number",
                            description: "Second number to sum"
                        },
                    },
                    required: ["a", "b"]
                }
            }
        )
    ]

    // create the agent
    const agent = new OpenAIAgent({ tools })

    let response = await agent.chat({
        message: "What's the budget of San Francisco for the health service system in 2023-24?",
    })
    console.log(response)

    let response2 = await agent.chat({
        message: "What's the budget of San Francisco for the police department in 2023-24?",
    })
    console.log(response2)

    let response3 = await agent.chat({
        message: "What's the combined budget of San Francisco for the health service system and police department in 2023-24?",
    })
    console.log(response3)

}

main().catch(console.error);
