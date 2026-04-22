namespace ClassroomAgent;

public class IdempotencyCache
{
    private const int MaxSize = 1000;
    private readonly LinkedList<string> _order = new();
    private readonly Dictionary<string, string> _results = new();
    private readonly Lock _lock = new();

    public bool TryGet(string commandId, out string? result)
    {
        lock (_lock)
            return _results.TryGetValue(commandId, out result);
    }

    public void Store(string commandId, string result)
    {
        lock (_lock)
        {
            if (_results.ContainsKey(commandId)) return;
            if (_order.Count >= MaxSize)
            {
                var oldest = _order.First!.Value;
                _order.RemoveFirst();
                _results.Remove(oldest);
            }
            _order.AddLast(commandId);
            _results[commandId] = result;
        }
    }
}
