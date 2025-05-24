import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip
} from '@mui/material';
import {
  Phone as PhoneIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
  AccessTime as AccessTimeIcon,
  Description as DescriptionIcon,
  LocalHospital as HospitalIcon
} from '@mui/icons-material';

// Types
interface TranscriptTurn {
  role: string;
  message: string;
}

interface CriteriaResult {
  criterion_name: string;
  result: string;
  rationale: string;
}

interface DataCollectionResult {
  data_type: string;
  collected: boolean;
  value?: string;
}

interface Analysis {
  criteria_results: CriteriaResult[];
  data_collection_results: DataCollectionResult[];
  overall_assessment: string;
  summary: string;
}

interface ElevenLabsDetails {
  transcript: TranscriptTurn[];
  claude_analysis: {
    analysis: Analysis;
  };
}

interface MedicalRecord {
  conversation_id: string;
  created_at: string;
  elevenlabs_details: ElevenLabsDetails;
}

interface ApiResponse {
  success: boolean;
  conversations: MedicalRecord[];
  error?: string;
}

const MedicalRecords: React.FC = () => {
  const navigate = useNavigate();
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecords = async () => {
      console.log('MedicalRecords: Fetching records for user123');
      try {
        const response = await fetch('/conversations/user123');
        console.log('MedicalRecords: API Response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('MedicalRecords: API Error:', errorText);
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: ApiResponse = await response.json();
        console.log('MedicalRecords: Received data:', data);
        
        if (data.success) {
          // Transform the data to match our component's expected structure
          const transformedRecords = data.conversations.map(record => ({
            conversation_id: record.conversation_id,
            created_at: record.created_at,
            elevenlabs_details: {
              transcript: record.elevenlabs_details?.transcript || [],
              claude_analysis: {
                analysis: record.elevenlabs_details?.claude_analysis?.analysis || {
                  criteria_results: [],
                  data_collection_results: [],
                  overall_assessment: 'unknown',
                  summary: 'No analysis available'
                }
              }
            }
          }));

          // Sort by date, newest first
          const sortedRecords = transformedRecords.sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          console.log('MedicalRecords: Transformed and sorted records:', sortedRecords);
          setRecords(sortedRecords);
        } else {
          setError(data.error || 'Failed to fetch medical records');
        }
      } catch (err) {
        console.error('MedicalRecords: Error:', err);
        setError(err instanceof Error ? err.message : 'Error loading medical records');
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, []);

  const getStatusIcon = (result?: string) => {
    switch (result?.toLowerCase()) {
      case 'success':
        return <CheckCircleIcon color="success" />;
      case 'failure':
        return <CancelIcon color="error" />;
      case 'partial success':
        return <WarningIcon color="warning" />;
      default:
        return <AccessTimeIcon color="action" />;
    }
  };

  const getStatusColor = (result?: string): 'success' | 'error' | 'warning' | 'default' => {
    switch (result?.toLowerCase()) {
      case 'success':
        return 'success';
      case 'failure':
        return 'error';
      case 'partial success':
        return 'warning';
      default:
        return 'default';
    }
  };

  const handleStartNewCall = () => {
    navigate('/call');
  };

  const handleExpandRecord = (recordId: string) => {
    setExpandedRecord(expandedRecord === recordId ? null : recordId);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">{error}</Alert>
        <Box mt={2} display="flex" justifyContent="center">
          <Button
            variant="contained"
            color="primary"
            startIcon={<PhoneIcon />}
            onClick={handleStartNewCall}
          >
            Start New Call
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={1}>
          <HospitalIcon color="primary" sx={{ fontSize: 32 }} />
          <Typography variant="h4">
            Medical Records
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<PhoneIcon />}
          onClick={handleStartNewCall}
        >
          New Consultation
        </Button>
      </Box>

      {records.length === 0 ? (
        <Box textAlign="center" py={4}>
          <Alert severity="info" sx={{ mb: 2 }}>
            No medical records found.
          </Alert>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PhoneIcon />}
            onClick={handleStartNewCall}
          >
            Start Your First Consultation
          </Button>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {records.map((record) => {
            const analysis = record.elevenlabs_details?.claude_analysis?.analysis;
            if (!analysis) {
              console.log('MedicalRecords: Skipping record without analysis:', record);
              return null;
            }

            console.log('MedicalRecords: Rendering record:', record);
            return (
              <Grid item xs={12} key={record.conversation_id}>
                <Accordion
                  expanded={expandedRecord === record.conversation_id}
                  onChange={() => handleExpandRecord(record.conversation_id)}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{
                      backgroundColor: 'background.paper',
                      '&:hover': {
                        backgroundColor: 'action.hover',
                      },
                    }}
                  >
                    <Grid container alignItems="center" spacing={2}>
                      <Grid item xs={12} sm={4}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <AccessTimeIcon color="action" />
                          <Typography>
                            {format(new Date(record.created_at), 'MMMM d, yyyy h:mm a')}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Chip
                            icon={getStatusIcon(analysis.overall_assessment)}
                            label={analysis.overall_assessment || 'Unknown'}
                            color={getStatusColor(analysis.overall_assessment)}
                          />
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <Typography variant="body2" color="text.secondary">
                          Consultation ID: {record.conversation_id}
                        </Typography>
                      </Grid>
                    </Grid>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Grid container spacing={3}>
                      {/* Health Assessment Section */}
                      <Grid item xs={12} md={6}>
                        <Card variant="outlined">
                          <CardContent>
                            <Typography variant="h6" gutterBottom>
                              Health Assessment
                            </Typography>
                            <TableContainer component={Paper} variant="outlined">
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Criteria</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Details</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {analysis.criteria_results?.map((criteria) => (
                                    <TableRow key={criteria.criterion_name}>
                                      <TableCell>
                                        {criteria.criterion_name.replace(/-/g, ' ').toUpperCase()}
                                      </TableCell>
                                      <TableCell>
                                        <Chip
                                          icon={getStatusIcon(criteria.result)}
                                          label={criteria.result || 'Unknown'}
                                          size="small"
                                          color={getStatusColor(criteria.result)}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <Tooltip title={criteria.rationale || 'No rationale available'}>
                                          <Typography variant="body2" noWrap>
                                            {criteria.rationale || 'No details available'}
                                          </Typography>
                                        </Tooltip>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </CardContent>
                        </Card>
                      </Grid>

                      {/* Data Collection Section */}
                      <Grid item xs={12} md={6}>
                        <Card variant="outlined">
                          <CardContent>
                            <Typography variant="h6" gutterBottom>
                              Collected Data
                            </Typography>
                            <TableContainer component={Paper} variant="outlined">
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Type</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Value</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {analysis.data_collection_results?.map((data) => (
                                    <TableRow key={data.data_type}>
                                      <TableCell>
                                        {data.data_type.replace(/-/g, ' ').toUpperCase()}
                                      </TableCell>
                                      <TableCell>
                                        <Chip
                                          icon={getStatusIcon(data.collected ? 'success' : 'failure')}
                                          label={data.collected ? 'Collected' : 'Not Collected'}
                                          size="small"
                                          color={getStatusColor(data.collected ? 'success' : 'failure')}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        {data.value || 'N/A'}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </CardContent>
                        </Card>
                      </Grid>

                      {/* Summary Section */}
                      <Grid item xs={12}>
                        <Card variant="outlined">
                          <CardContent>
                            <Typography variant="h6" gutterBottom>
                              Consultation Summary
                            </Typography>
                            <Typography variant="body1" paragraph>
                              {analysis.summary || 'No summary available'}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>

                      {/* Transcript Section */}
                      {record.elevenlabs_details?.transcript && record.elevenlabs_details.transcript.length > 0 && (
                        <Grid item xs={12}>
                          <Card variant="outlined">
                            <CardContent>
                              <Box display="flex" alignItems="center" gap={1} mb={2}>
                                <DescriptionIcon color="primary" />
                                <Typography variant="h6">
                                  Consultation Transcript
                                </Typography>
                              </Box>
                              <Box
                                sx={{
                                  maxHeight: '300px',
                                  overflow: 'auto',
                                  bgcolor: 'grey.50',
                                  p: 2,
                                  borderRadius: 1,
                                }}
                              >
                                {record.elevenlabs_details.transcript.map((turn, index) => (
                                  <Box
                                    key={index}
                                    mb={1}
                                    sx={{
                                      backgroundColor: turn.role === 'user' ? 'primary.light' : 'grey.100',
                                      p: 1,
                                      borderRadius: 1,
                                    }}
                                  >
                                    <Typography variant="caption" color="text.secondary">
                                      {turn.role.toUpperCase()}:
                                    </Typography>
                                    <Typography variant="body2">
                                      {turn.message}
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            </CardContent>
                          </Card>
                        </Grid>
                      )}
                    </Grid>
                  </AccordionDetails>
                </Accordion>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
};

export default MedicalRecords; 