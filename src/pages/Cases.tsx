import { Navigate } from 'react-router-dom';

// All Cases redirects to Follow-up which has the full table view
const Cases = () => <Navigate to="/follow-up" replace />;

export default Cases;
