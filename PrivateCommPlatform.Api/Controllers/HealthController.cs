using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using PrivateCommPlatform.Api.Configuration;

namespace PrivateCommPlatform.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class HealthController : ControllerBase
    {
        private readonly TurnConfiguration _turnConfig;

        public HealthController(IOptions<TurnConfiguration> turnConfig)
        {
            _turnConfig = turnConfig.Value;
        }

        [HttpGet("turn")]
        public IActionResult GetTurnHealth()
        {
            bool isValid = _turnConfig.Enabled 
                           && !string.IsNullOrEmpty(_turnConfig.Secret) 
                           && _turnConfig.Uris != null 
                           && _turnConfig.Uris.Length > 0;

            return Ok(new
            {
                enabled = _turnConfig.Enabled,
                realm = _turnConfig.Realm,
                uris = _turnConfig.Uris,
                expiry = _turnConfig.ExpirySeconds,
                valid = isValid
            });
        }
    }
}
