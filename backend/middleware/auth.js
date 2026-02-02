const { supabase } = require('../server');

async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);

    // Verify JWT token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Attach user to request
    req.user = user;
    req.token = token;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

async function requireRole(roles) {
  return async (req, res, next) => {
    try {
      const { data: userRoles, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', req.user.id);

      if (error) throw error;

      const hasRole = userRoles.some(ur => roles.includes(ur.role));

      if (!hasRole) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      next();
    } catch (error) {
      res.status(403).json({ error: 'Permission check failed' });
    }
  };
}

async function requireKYC(tier = 1) {
  return async (req, res, next) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('kyc_status, kyc_tier')
        .eq('id', req.user.id)
        .single();

      if (error) throw error;

      if (profile.kyc_status !== 'verified' || profile.kyc_tier < tier) {
        return res.status(403).json({ 
          error: 'KYC verification required',
          required_tier: tier,
          current_tier: profile.kyc_tier,
          kyc_status: profile.kyc_status
        });
      }

      next();
    } catch (error) {
      res.status(403).json({ error: 'KYC check failed' });
    }
  };
}

module.exports = {
  authenticateUser,
  requireRole,
  requireKYC
};
