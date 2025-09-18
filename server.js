const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'your-secret-key';

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/lateComersDB', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((err) => {
    console.error('MongoDB connection error:', err);
});

// Schema Definitions
const teacherSchema = new mongoose.Schema({
    teacherId: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    section: {
        type: String,
        required: true,
        enum: ['A', 'B', 'C', 'D']
    }
});

// Late Record Schema - now the main schema for student records
const lateRecordSchema = new mongoose.Schema({
    regdNumber: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    department: {
        type: String,
        required: true,
        enum: ['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT']
    },
    section: {
        type: String,
        required: true,
        enum: ['A', 'B', 'C', 'D']
    },
    time: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    }
});

const Teacher = mongoose.model('Teacher', teacherSchema);
const LateRecord = mongoose.model('LateRecord', lateRecordSchema);

// Initialize default teacher with section assignment
async function initializeTeacher() {
    try {
        const teacherExists = await Teacher.findOne({ teacherId: '4272' });
        if (!teacherExists) {
            const hashedPassword = await bcrypt.hash('shafi123', 10);
            await Teacher.create({
                teacherId: '4272',
                password: hashedPassword,
                section: 'A' // Teacher 4272 is assigned to section A
            });
            console.log('Default teacher account created');
        }
    } catch (error) {
        console.error('Error initializing teacher:', error);
    }
}

initializeTeacher();

// Middleware to verify teacher token
// Get All Late Records (Teacher View)



// Routes

// Teacher Login
app.post('/api/teacher/login', async (req, res) => {
    try {
        const { teacherId, password } = req.body;
        const teacher = await Teacher.findOne({ teacherId });

        if (!teacher) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, teacher.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: teacher._id, role: 'teacher', teacherId: teacherId }, JWT_SECRET);
        res.json({ 
            token,
            teacherId: teacherId,
            section: teacher.section 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

const verifyTeacher = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'teacher') {
            return res.status(403).json({ message: 'Not authorized' });
        }

        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

// Get Teacher Section
app.get('/api/teacher/section', verifyTeacher, async (req, res) => {
    try {
        const teacher = await Teacher.findById(req.teacherId);
        if (!teacher) {
            return res.status(404).json({ message: 'Teacher not found' });
        }
        res.json({ section: teacher.section });
    } catch (error) {
        console.error('Error fetching teacher section:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add Late Record (Protected route)
app.post('/api/students', verifyTeacher, async (req, res) => {
    try {
        const { regdNumber, name, department, section, time, reason } = req.body;

        // Validation
        if (!regdNumber || !name || !department || !section || !time || !reason) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if there's already a record for this student today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const existingRecord = await LateRecord.findOne({ 
            regdNumber,
            date: {
                $gte: today,
                $lt: tomorrow
            }
        });

        if (existingRecord) {
            return res.status(400).json({ message: 'Record already exists for this student today' });
        }

        // Create new record
        const lateRecord = await LateRecord.create({
            regdNumber,
            name,
            department,
            section,
            time,
            reason
        });
        
        res.status(201).json(lateRecord);
    } catch (error) {
        console.error('Error adding student record:', error);
        res.status(500).json({ message: 'Error adding student record' });
    }
});

// Get Student Records (Public route)
app.get('/api/students/:regdNumber', async (req, res) => {
    try {
        const records = await LateRecord.find({ 
            regdNumber: req.params.regdNumber 
        }).sort({ date: -1 }); // Sort by date, newest first
        
        if (!records || records.length === 0) {
            return res.status(404).json({ 
                message: 'No records found for this registration number' 
            });
        }
        
        // Get student info from the most recent record
        const studentInfo = {
            regdNumber: records[0].regdNumber,
            name: records[0].name,
            department: records[0].department,
            section: records[0].section
        };
        
        res.json({
            student: studentInfo,
            records: records
        });
    } catch (error) {
        console.error('Error fetching student records:', error);
        res.status(500).json({ 
            message: 'Error fetching student records' 
        });
    }
});

// Get All Late Records (Teacher View)
app.get('/api/students', verifyTeacher, async (req, res) => {
    try {
        const { department, section, date } = req.query;
        let query = {};

        if (department) query.department = department;
        if (section) query.section = section;
        if (date) {
            const searchDate = new Date(date);
            query.date = {
                $gte: new Date(searchDate.setHours(0, 0, 0, 0)),
                $lt: new Date(searchDate.setHours(23, 59, 59, 999))
            };
        }

        const records = await LateRecord.find(query)
            .sort({ date: -1 });
        
        res.json(records);
    } catch (error) {
        console.error('Error fetching records:', error);
        res.status(500).json({ message: 'Error fetching records' });
    }
});


// Get Department Records
app.get('/api/department/:department', verifyTeacher, async (req, res) => {
    try {
        const records = await LateRecord.find({ 
            department: req.params.department,
            date: {
                $gte: new Date().setHours(0, 0, 0, 0),
                $lt: new Date().setHours(23, 59, 59, 999)
            }
        }).sort({ time: 1 });
        
        res.json(records);
    } catch (error) {
        console.error('Error fetching department records:', error);
        res.status(500).json({ message: 'Error fetching department records' });
    }
});

// Delete Late Record
app.delete('/api/students/:id', verifyTeacher, async (req, res) => {
    try {
        const record = await LateRecord.findByIdAndDelete(req.params.id);
        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }
        res.json({ message: 'Record deleted successfully' });
    } catch (error) {
        console.error('Error deleting record:', error);
        res.status(500).json({ message: 'Error deleting record' });
    }
});

// Get Today's Statistics (Teacher Only)
app.get('/api/statistics', verifyTeacher, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const stats = await LateRecord.aggregate([
            {
                $match: {
                    date: {
                        $gte: today,
                        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                    }
                }
            },
            {
                $group: {
                    _id: '$department',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json(stats);
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ message: 'Error fetching statistics' });
    }
});

// Server startup
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Default teacher credentials:');
    console.log('Teacher ID: 4272');
    console.log('Password: shafi123');
    console.log('Section: A');
});
