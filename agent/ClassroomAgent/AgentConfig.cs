namespace ClassroomAgent;

public class AgentConfig
{
    public string BackendUrl { get; set; } = "ws://classroomctl.local:8082/ws";
    public string Token { get; set; } = "";
    public string PcName { get; set; } = Environment.MachineName;
}
