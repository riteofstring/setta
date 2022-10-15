import { Controller, Request, Post, UseGuards, Param } from '@nestjs/common';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { LocalAuthGuard } from './auth/local-auth.guard';
import { AuthService } from './auth/auth.service';
import { ProjectsService } from './projects/projects.service';

@Controller()
export class AppController {
  constructor(
    private authService: AuthService,
    private projectsService: ProjectsService,
  ) {}

  @UseGuards(LocalAuthGuard)
  @Post('auth/login')
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Post('auth/register')
  async register(@Request() req) {
    return this.authService.register(req.body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('')
  verifyToken(@Request() req) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('projects')
  getProjects(@Request() req) {
    return this.projectsService.getAllByOwner(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('projects/load/:id')
  loadProject(@Param('id') id: string) {
    return this.projectsService.loadOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('projects/createProject')
  createProject(@Request() req) {
    return this.projectsService.createProject(req.user.id, req.body.name);
  }
}
