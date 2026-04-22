namespace ClassroomAgent;

public class AgentConfig
{
    public string BackendUrl { get; set; } = "ws://localhost:8080/ws";
    public string Token { get; set; } = "";
    public string PcName { get; set; } = Environment.MachineName;
}
