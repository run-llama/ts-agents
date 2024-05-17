import {
    OpenAI,
    FunctionTool,
    OpenAIAgent,
    Settings,
    SimpleDirectoryReader,
    HuggingFaceEmbedding,
    VectorStoreIndex,
    QueryEngineTool
} from "llamaindex"
import 'dotenv/config'

async function main() {

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

    // load our data and create a query engine
    const reader = new SimpleDirectoryReader()
    const documents = await reader.loadData("../data")
    const index = await VectorStoreIndex.fromDocuments(documents)
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
        message: "What's the budget of San Francisco for community health in 2023-24?",
    })
    console.log(response)

    let response2 = await agent.chat({
        message: "What's the budget of San Francisco for public protection in 2023-24?",
    })
    console.log(response2)

    let response3 = await agent.chat({
        message: "What's the combined budget of San Francisco for community health and public protection in 2023-24?",
    })
    console.log(response3)

}

main().catch(console.error);
