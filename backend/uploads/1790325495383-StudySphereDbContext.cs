using Microsoft.EntityFrameworkCore;
using StudySphere.Models;

namespace StudySphere.Data
{
    public class StudySphereDbContext : DbContext
    {
        public StudySphereDbContext(
            DbContextOptions<StudySphereDbContext> options)
            : base(options)
        {
        }

        // =========================================================
        // DbSets
        // =========================================================

        public DbSet<User> Users { get; set; } = null!;
        public DbSet<Student> Students { get; set; } = null!;
        public DbSet<Instructor> Instructors { get; set; } = null!;
        public DbSet<Admin> Admins { get; set; } = null!;

        public DbSet<Course> Courses { get; set; } = null!;
        public DbSet<Enrollment> Enrollments { get; set; } = null!;
        public DbSet<Material> Materials { get; set; } = null!;
        public DbSet<Announcement> Announcements { get; set; } = null!;
        public DbSet<LiveLecture> LiveLectures { get; set; } = null!;


        // =========================================================
        // RELATIONSHIPS
        // =========================================================

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);


            // =====================================================
            // USER -> STUDENT
            // One User can have one Student profile
            // =====================================================

            modelBuilder.Entity<Student>()
                .HasOne(s => s.User)
                .WithOne(u => u.Student)
                .HasForeignKey<Student>(s => s.StudentId)
                .OnDelete(DeleteBehavior.Cascade);


            // =====================================================
            // USER -> INSTRUCTOR
            // One User can have one Instructor profile
            // =====================================================

            modelBuilder.Entity<Instructor>()
                .HasOne(i => i.User)
                .WithOne(u => u.Instructor)
                .HasForeignKey<Instructor>(i => i.InstructorId)
                .OnDelete(DeleteBehavior.Cascade);


            // =====================================================
            // USER -> ADMIN
            // One User can have one Admin profile
            // =====================================================

            modelBuilder.Entity<Admin>()
                .HasOne(a => a.User)
                .WithOne(u => u.Admin)
                .HasForeignKey<Admin>(a => a.AdminId)
                .OnDelete(DeleteBehavior.Cascade);


            // =====================================================
            // INSTRUCTOR -> COURSES
            // One Instructor can create many Courses
            // =====================================================

            modelBuilder.Entity<Course>()
                .HasOne(c => c.Instructor)
                .WithMany(i => i.Courses)
                .HasForeignKey(c => c.InstructorId)
                .OnDelete(DeleteBehavior.Restrict);


            // =====================================================
            // COURSE -> MATERIALS
            // One Course can have many Materials
            // =====================================================

            modelBuilder.Entity<Material>()
                .HasOne(m => m.Course)
                .WithMany(c => c.Materials)
                .HasForeignKey(m => m.CourseId)
                .OnDelete(DeleteBehavior.Cascade);


            // =====================================================
            // STUDENT -> ENROLLMENTS
            // One Student can have many Enrollments
            // =====================================================

            modelBuilder.Entity<Enrollment>()
                .HasOne(e => e.Student)
                .WithMany(s => s.Enrollments)
                .HasForeignKey(e => e.StudentId)
                .OnDelete(DeleteBehavior.Cascade);


            // =====================================================
            // COURSE -> ENROLLMENTS
            // One Course can have many Enrollments
            // =====================================================

            modelBuilder.Entity<Enrollment>()
                .HasOne(e => e.Course)
                .WithMany(c => c.Enrollments)
                .HasForeignKey(e => e.CourseId)
                .OnDelete(DeleteBehavior.Cascade);


            // =====================================================
            // COURSE -> ANNOUNCEMENTS
            // One Course can have many Announcements
            // =====================================================

            modelBuilder.Entity<Announcement>()
                .HasOne(a => a.Course)
                .WithMany(c => c.Announcements)
                .HasForeignKey(a => a.CourseId)
                .OnDelete(DeleteBehavior.Restrict);


            // =====================================================
            // INSTRUCTOR -> ANNOUNCEMENTS
            // One Instructor can create many Announcements
            // =====================================================

            modelBuilder.Entity<Announcement>()
                .HasOne(a => a.Instructor)
                .WithMany(i => i.Announcements)
                .HasForeignKey(a => a.InstructorId)
                .OnDelete(DeleteBehavior.Restrict);


            // =====================================================
            // COURSE -> LIVE LECTURES
            // One Course can have many Live Lectures
            // =====================================================

            modelBuilder.Entity<LiveLecture>()
                .HasOne(l => l.Course)
                .WithMany(c => c.LiveLectures)
                .HasForeignKey(l => l.CourseId)
                .OnDelete(DeleteBehavior.Restrict);


            // =====================================================
            // INSTRUCTOR -> LIVE LECTURES
            // One Instructor can conduct many Live Lectures
            // =====================================================

            modelBuilder.Entity<LiveLecture>()
                .HasOne(l => l.Instructor)
                .WithMany(i => i.LiveLectures)
                .HasForeignKey(l => l.InstructorId)
                .OnDelete(DeleteBehavior.Restrict);


            // =====================================================
            // Student.LiveLectures
            //
            // LiveLecture currently has no StudentId.
            // Therefore this navigation cannot be mapped as a
            // normal FK relationship.
            //
            // We ignore it for EF Core for now.
            // =====================================================

            modelBuilder.Entity<Student>()
                .Ignore(s => s.LiveLectures);


            // =====================================================
            // ENROLLMENT.PROGRESS
            // SQL Server decimal precision
            // =====================================================

            modelBuilder.Entity<Enrollment>()
                .Property(e => e.Progress)
                .HasPrecision(5, 2);


            // =====================================================
            // UNIQUE EMAIL
            // =====================================================

            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email)
                .IsUnique();


            // =====================================================
            // SEED DATA
            // =====================================================

            SeedData(modelBuilder);
        }


        // =========================================================
        // SEED DATA
        // =========================================================

        private static void SeedData(ModelBuilder modelBuilder)
        {
            // -----------------------------------------------------
            // USERS
            //
            // Shared primary-key relationship:
            //
            // Student.StudentId    -> User.UserId
            // Instructor.InstructorId -> User.UserId
            // Admin.AdminId        -> User.UserId
            //
            // Therefore User records must exist first.
            // -----------------------------------------------------

            modelBuilder.Entity<User>().HasData(

                // Students
                new User
                {
                    UserId = 1,
                    FullName = "Student One",
                    Email = "student1@studysphere.com",
                    PasswordHash = "password",
                    Phone = "9876543201",
                    Role = "Student",
                    CreatedAt = new DateTime(2026, 9, 1),
                    IsActive = true
                },

                new User
                {
                    UserId = 2,
                    FullName = "Student Two",
                    Email = "student2@studysphere.com",
                    PasswordHash = "password",
                    Phone = "9876543202",
                    Role = "Student",
                    CreatedAt = new DateTime(2026, 9, 1),
                    IsActive = true
                },

                new User
                {
                    UserId = 3,
                    FullName = "Student Three",
                    Email = "student3@studysphere.com",
                    PasswordHash = "password",
                    Phone = "9876543203",
                    Role = "Student",
                    CreatedAt = new DateTime(2026, 9, 1),
                    IsActive = true
                },

                new User
                {
                    UserId = 4,
                    FullName = "Student Four",
                    Email = "student4@studysphere.com",
                    PasswordHash = "password",
                    Phone = "9876543204",
                    Role = "Student",
                    CreatedAt = new DateTime(2026, 9, 1),
                    IsActive = true
                },

                new User
                {
                    UserId = 5,
                    FullName = "Student Five",
                    Email = "student5@studysphere.com",
                    PasswordHash = "password",
                    Phone = "9876543205",
                    Role = "Student",
                    CreatedAt = new DateTime(2026, 9, 1),
                    IsActive = true
                },

                // Instructors
                new User
                {
                    UserId = 6,
                    FullName = "Instructor One",
                    Email = "instructor1@studysphere.com",
                    PasswordHash = "password",
                    Phone = "9876543210",
                    Role = "Instructor",
                    CreatedAt = new DateTime(2026, 9, 1),
                    IsActive = true
                },

                new User
                {
                    UserId = 7,
                    FullName = "Instructor Two",
                    Email = "instructor2@studysphere.com",
                    PasswordHash = "password",
                    Phone = "9876543211",
                    Role = "Instructor",
                    CreatedAt = new DateTime(2026, 9, 1),
                    IsActive = true
                },

                new User
                {
                    UserId = 8,
                    FullName = "Instructor Three",
                    Email = "instructor3@studysphere.com",
                    PasswordHash = "password",
                    Phone = "9876543212",
                    Role = "Instructor",
                    CreatedAt = new DateTime(2026, 9, 1),
                    IsActive = true
                },

                // Admin
                new User
                {
                    UserId = 9,
                    FullName = "System Admin",
                    Email = "admin@studysphere.com",
                    PasswordHash = "password",
                    Phone = "9876543213",
                    Role = "Admin",
                    CreatedAt = new DateTime(2026, 9, 1),
                    IsActive = true
                }
            );


            // -----------------------------------------------------
            // STUDENTS
            // -----------------------------------------------------

            modelBuilder.Entity<Student>().HasData(

                new Student
                {
                    StudentId = 1,
                    EnrollmentNo = "STU001",
                    Bio = "Computer Engineering student.",
                    ProfileImage = null
                },

                new Student
                {
                    StudentId = 2,
                    EnrollmentNo = "STU002",
                    Bio = "Computer Engineering student.",
                    ProfileImage = null
                },

                new Student
                {
                    StudentId = 3,
                    EnrollmentNo = "STU003",
                    Bio = "Computer Engineering student.",
                    ProfileImage = null
                },

                new Student
                {
                    StudentId = 4,
                    EnrollmentNo = "STU004",
                    Bio = "Computer Engineering student.",
                    ProfileImage = null
                },

                new Student
                {
                    StudentId = 5,
                    EnrollmentNo = "STU005",
                    Bio = "Computer Engineering student.",
                    ProfileImage = null
                }
            );


            // -----------------------------------------------------
            // INSTRUCTORS
            //
            // IDs 6,7,8 correspond to Users 6,7,8.
            // -----------------------------------------------------

            modelBuilder.Entity<Instructor>().HasData(

                new Instructor
                {
                    InstructorId = 6,
                    ProfessionalTitle = "Senior Software Developer",
                    AreaOfExpertise = "Web Development",
                    Qualification = "B.Tech Computer Engineering",
                    Bio = "Experienced instructor in web and backend development.",
                    ProfileImage = null
                },

                new Instructor
                {
                    InstructorId = 7,
                    ProfessionalTitle = "Java Developer",
                    AreaOfExpertise = "Java and Spring Boot",
                    Qualification = "M.Tech Computer Science",
                    Bio = "Experienced Java and backend development instructor.",
                    ProfileImage = null
                },

                new Instructor
                {
                    InstructorId = 8,
                    ProfessionalTitle = "Database Specialist",
                    AreaOfExpertise = "Database Management",
                    Qualification = "M.Tech Information Technology",
                    Bio = "Experienced database management instructor.",
                    ProfileImage = null
                }
            );


            // -----------------------------------------------------
            // ADMIN
            // -----------------------------------------------------

            modelBuilder.Entity<Admin>().HasData(

                new Admin
                {
                    AdminId = 9,
                    Designation = "System Administrator"
                }
            );


            // -----------------------------------------------------
            // COURSES
            // -----------------------------------------------------

            modelBuilder.Entity<Course>().HasData(

                new Course
                {
                    CourseId = 1,
                    Title = "ASP.NET Core MVC",
                    Description = "Learn ASP.NET Core MVC from basics to advanced concepts.",
                    Category = "Web Development",
                    Level = "Intermediate",
                    ThumbnailUrl = "/images/courses/aspnet.jpg",
                    Price = 1499,
                    Status = "Approved",
                    CreatedAt = new DateTime(2026, 9, 1),
                    UpdatedAt = null,
                    InstructorId = 6
                },

                new Course
                {
                    CourseId = 2,
                    Title = "Java Programming",
                    Description = "Learn Java programming and backend development fundamentals.",
                    Category = "Programming",
                    Level = "Beginner",
                    ThumbnailUrl = "/images/courses/java.jpg",
                    Price = 999,
                    Status = "Approved",
                    CreatedAt = new DateTime(2026, 9, 1),
                    UpdatedAt = null,
                    InstructorId = 7
                },

                new Course
                {
                    CourseId = 3,
                    Title = "Complete C# Programming",
                    Description = "Learn C# programming from fundamentals to advanced concepts.",
                    Category = "Programming",
                    Level = "Beginner",
                    ThumbnailUrl = "/images/courses/csharp.jpg",
                    Price = 799,
                    Status = "Pending",
                    CreatedAt = new DateTime(2026, 9, 1),
                    UpdatedAt = null,
                    InstructorId = 6
                },

                new Course
                {
                    CourseId = 4,
                    Title = "Database Management System",
                    Description = "Learn database concepts, SQL and database design.",
                    Category = "Database",
                    Level = "Intermediate",
                    ThumbnailUrl = "/images/courses/database.jpg",
                    Price = 1199,
                    Status = "Pending",
                    CreatedAt = new DateTime(2026, 9, 1),
                    UpdatedAt = null,
                    InstructorId = 8
                },

                new Course
                {
                    CourseId = 5,
                    Title = "Basic Web Design",
                    Description = "Learn HTML, CSS and basic web design concepts.",
                    Category = "Web Development",
                    Level = "Beginner",
                    ThumbnailUrl = "/images/courses/webdesign.jpg",
                    Price = 599,
                    Status = "Rejected",
                    CreatedAt = new DateTime(2026, 9, 1),
                    UpdatedAt = null,
                    InstructorId = 7
                }
            );


            // -----------------------------------------------------
            // MATERIALS
            // -----------------------------------------------------

            modelBuilder.Entity<Material>().HasData(

                new Material
                {
                    MaterialId = 1,
                    CourseId = 1,
                    Title = "Introduction to ASP.NET Core MVC",
                    Description = "Introduction to ASP.NET Core MVC.",
                    MaterialType = "Video",
                    FileUrl = "/materials/aspnet/introduction.mp4",
                    DurationInMinutes = 25,
                    DisplayOrder = 1,
                    IsPublished = true,
                    UploadedAt = new DateTime(2026, 9, 1)
                },

                new Material
                {
                    MaterialId = 2,
                    CourseId = 1,
                    Title = "MVC Architecture Notes",
                    Description = "PDF notes explaining MVC architecture.",
                    MaterialType = "PDF",
                    FileUrl = "/materials/aspnet/mvc-notes.pdf",
                    DurationInMinutes = null,
                    DisplayOrder = 2,
                    IsPublished = true,
                    UploadedAt = new DateTime(2026, 9, 1)
                },

                new Material
                {
                    MaterialId = 3,
                    CourseId = 1,
                    Title = "Controllers in ASP.NET Core",
                    Description = "Understanding controllers and action methods.",
                    MaterialType = "Video",
                    FileUrl = "/materials/aspnet/controllers.mp4",
                    DurationInMinutes = 30,
                    DisplayOrder = 3,
                    IsPublished = true,
                    UploadedAt = new DateTime(2026, 9, 1)
                },

                new Material
                {
                    MaterialId = 4,
                    CourseId = 2,
                    Title = "Spring Boot Introduction",
                    Description = "Introduction to Spring Boot.",
                    MaterialType = "Video",
                    FileUrl = "/materials/java/spring-introduction.mp4",
                    DurationInMinutes = 35,
                    DisplayOrder = 1,
                    IsPublished = true,
                    UploadedAt = new DateTime(2026, 9, 1)
                },

                new Material
                {
                    MaterialId = 5,
                    CourseId = 2,
                    Title = "Spring Boot Notes",
                    Description = "Spring Boot learning notes.",
                    MaterialType = "PDF",
                    FileUrl = "/materials/java/spring-notes.pdf",
                    DurationInMinutes = null,
                    DisplayOrder = 2,
                    IsPublished = false,
                    UploadedAt = new DateTime(2026, 9, 1)
                }
            );


            // -----------------------------------------------------
            // ENROLLMENTS
            // -----------------------------------------------------

            modelBuilder.Entity<Enrollment>().HasData(

                new Enrollment
                {
                    EnrollmentId = 1,
                    StudentId = 1,
                    CourseId = 1,
                    EnrolledAt = new DateTime(2026, 9, 1),
                    Status = "Active",
                    Progress = 75,
                    CompletedAt = null
                },

                new Enrollment
                {
                    EnrollmentId = 2,
                    StudentId = 2,
                    CourseId = 1,
                    EnrolledAt = new DateTime(2026, 9, 2),
                    Status = "Active",
                    Progress = 50,
                    CompletedAt = null
                },

                new Enrollment
                {
                    EnrollmentId = 3,
                    StudentId = 3,
                    CourseId = 2,
                    EnrolledAt = new DateTime(2026, 9, 3),
                    Status = "Completed",
                    Progress = 100,
                    CompletedAt = new DateTime(2026, 9, 15)
                },

                new Enrollment
                {
                    EnrollmentId = 4,
                    StudentId = 4,
                    CourseId = 1,
                    EnrolledAt = new DateTime(2026, 9, 4),
                    Status = "Active",
                    Progress = 40,
                    CompletedAt = null
                }
            );


            // -----------------------------------------------------
            // ANNOUNCEMENTS
            // -----------------------------------------------------

            modelBuilder.Entity<Announcement>().HasData(

                new Announcement
                {
                    AnnouncementId = 1,
                    CourseId = 1,
                    InstructorId = 6,
                    Title = "Welcome to ASP.NET Core MVC",
                    Message = "Welcome to the ASP.NET Core MVC course.",
                    CreatedAt = new DateTime(2026, 9, 1),
                    IsPublished = true
                },

                new Announcement
                {
                    AnnouncementId = 2,
                    CourseId = 1,
                    InstructorId = 6,
                    Title = "Assignment 1",
                    Message = "Assignment 1 has been published.",
                    CreatedAt = new DateTime(2026, 9, 5),
                    IsPublished = true
                },

                new Announcement
                {
                    AnnouncementId = 3,
                    CourseId = 2,
                    InstructorId = 7,
                    Title = "Spring Boot Practice",
                    Message = "Practice the Spring Boot concepts covered in the lectures.",
                    CreatedAt = new DateTime(2026, 9, 6),
                    IsPublished = true
                }
            );


            // -----------------------------------------------------
            // LIVE LECTURES
            // -----------------------------------------------------

            modelBuilder.Entity<LiveLecture>().HasData(

                new LiveLecture
                {
                    LiveLectureId = 1,
                    CourseId = 1,
                    InstructorId = 6,
                    Title = "ASP.NET Core MVC - Controllers",
                    Description = "Live lecture about controllers in ASP.NET Core MVC.",
                    StartTime = new DateTime(2026, 9, 18, 16, 0, 0),
                    EndTime = new DateTime(2026, 9, 18, 17, 0, 0),
                    MeetingUrl = "https://meet.example.com/aspnet",
                    Status = "Scheduled",
                    CreatedAt = new DateTime(2026, 9, 1)
                },

                new LiveLecture
                {
                    LiveLectureId = 2,
                    CourseId = 2,
                    InstructorId = 7,
                    Title = "Spring Boot REST API",
                    Description = "Live lecture about creating REST APIs using Spring Boot.",
                    StartTime = new DateTime(2026, 9, 19, 17, 0, 0),
                    EndTime = new DateTime(2026, 9, 19, 18, 0, 0),
                    MeetingUrl = "https://meet.example.com/spring",
                    Status = "Scheduled",
                    CreatedAt = new DateTime(2026, 9, 1)
                }
            );
        }
    }
}